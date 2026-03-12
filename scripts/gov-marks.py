#!/usr/bin/env python3
"""Scan the Gorgon CT log for Government Mark certificates."""

import base64
import hashlib
import struct
import sys
import time
from datetime import datetime, timezone

import requests
from cryptography import x509
from cryptography.x509.oid import ExtensionOID, NameOID

BASE_URL = "https://gorgon.ct.digicert.com/log"
USER_AGENT = "bimi-quest/1.0 (CT Log Scanner)"
BATCH_SIZE = 500
THROTTLE = 0.15  # seconds between batches

LOGOTYPE_OID = x509.ObjectIdentifier("1.3.6.1.5.5.7.1.12")
MARK_TYPE_OID = x509.ObjectIdentifier("1.3.6.1.4.1.53087.1.13")


def get_sth():
    r = requests.get(f"{BASE_URL}/ct/v1/get-sth", headers={"User-Agent": USER_AGENT}, timeout=30)
    r.raise_for_status()
    return r.json()


def get_entries(start, end):
    r = requests.get(
        f"{BASE_URL}/ct/v1/get-entries",
        params={"start": start, "end": end},
        headers={"User-Agent": USER_AGENT},
        timeout=30,
    )
    r.raise_for_status()
    return r.json()["entries"]


def read_uint24(buf, offset):
    return buf[offset] * 65536 + (buf[offset + 1] << 8) + buf[offset + 2]


def read_uint64(buf, offset):
    return struct.unpack(">Q", buf[offset : offset + 8])[0]


def parse_cert_from_entry(entry):
    """Extract the certificate DER, timestamp, and entry type from a CT log entry."""
    leaf = base64.b64decode(entry["leaf_input"])
    if leaf[0] != 0 or leaf[1] != 0:
        return None
    timestamp = read_uint64(leaf, 2)
    entry_type = (leaf[10] << 8) | leaf[11]

    if entry_type == 0:  # x509_entry
        cert_len = read_uint24(leaf, 12)
        cert_der = leaf[15 : 15 + cert_len]
        is_precert = False
    elif entry_type == 1:  # precert_entry
        extra = base64.b64decode(entry["extra_data"])
        pre_cert_len = read_uint24(extra, 0)
        cert_der = extra[3 : 3 + pre_cert_len]
        is_precert = True
    else:
        return None

    return cert_der, timestamp, is_precert


def extract_dn_attr(name, oid):
    """Extract a single attribute value from an x509 Name by OID."""
    attrs = name.get_attributes_for_oid(oid)
    return attrs[0].value if attrs else None


def has_logotype_ext(cert):
    """Check if the cert has the BIMI logotype extension."""
    try:
        cert.extensions.get_extension_for_oid(LOGOTYPE_OID)
        return True
    except x509.ExtensionNotFound:
        return False


def get_mark_type(cert):
    """Extract the BIMI mark type from the subject DN."""
    return extract_dn_attr(cert.subject, MARK_TYPE_OID)


def fmt_date(dt):
    return dt.strftime("%Y-%m-%d") if dt else "—"


def is_valid(not_after):
    if not_after is None:
        return "unknown"
    # not_after may be naive (no tzinfo) from cryptography lib
    na = not_after if not_after.tzinfo else not_after.replace(tzinfo=timezone.utc)
    return "valid" if na > datetime.now(timezone.utc) else "expired"


def main():
    sth = get_sth()
    tree_size = sth["tree_size"]
    print(f"Gorgon tree size: {tree_size:,}", file=sys.stderr)
    print(f"Scanning all entries for Government Mark certs...\n", file=sys.stderr)

    gov_certs = []
    scanned = 0
    bimi_count = 0

    for start in range(0, tree_size, BATCH_SIZE):
        end = min(start + BATCH_SIZE - 1, tree_size - 1)
        entries = get_entries(start, end)

        for i, entry in enumerate(entries):
            idx = start + i
            try:
                parsed = parse_cert_from_entry(entry)
                if parsed is None:
                    continue
                cert_der, timestamp, is_precert = parsed
                cert = x509.load_der_x509_certificate(cert_der)

                if not has_logotype_ext(cert):
                    continue
                bimi_count += 1

                mark_type = get_mark_type(cert)
                if mark_type != "Government Mark":
                    continue

                fingerprint = hashlib.sha256(cert_der).hexdigest()
                sans = []
                try:
                    san_ext = cert.extensions.get_extension_for_oid(ExtensionOID.SUBJECT_ALTERNATIVE_NAME)
                    sans = san_ext.value.get_values_for_type(x509.DNSName)
                except x509.ExtensionNotFound:
                    pass

                gov_certs.append(
                    {
                        "index": idx,
                        "timestamp": datetime.fromtimestamp(timestamp / 1000, tz=timezone.utc),
                        "is_precert": is_precert,
                        "fingerprint": fingerprint,
                        "serial": format(cert.serial_number, "x"),
                        "subject_org": extract_dn_attr(cert.subject, NameOID.ORGANIZATION_NAME),
                        "subject_cn": extract_dn_attr(cert.subject, NameOID.COMMON_NAME),
                        "subject_country": extract_dn_attr(cert.subject, NameOID.COUNTRY_NAME),
                        "subject_state": extract_dn_attr(cert.subject, NameOID.STATE_OR_PROVINCE_NAME),
                        "subject_locality": extract_dn_attr(cert.subject, NameOID.LOCALITY_NAME),
                        "issuer_org": extract_dn_attr(cert.issuer, NameOID.ORGANIZATION_NAME),
                        "issuer_cn": extract_dn_attr(cert.issuer, NameOID.COMMON_NAME),
                        "mark_type": mark_type,
                        "not_before": cert.not_valid_before_utc,
                        "not_after": cert.not_valid_after_utc,
                        "sans": sans,
                    }
                )
            except Exception as e:
                print(f"  [warn] entry {idx}: {e}", file=sys.stderr)

        scanned = end + 1
        pct = scanned / tree_size * 100
        print(f"  {scanned:,}/{tree_size:,} ({pct:.0f}%) — {bimi_count} BIMI, {len(gov_certs)} gov", file=sys.stderr)
        time.sleep(THROTTLE)

    # Report
    print(f"Government Mark Certificates — {len(gov_certs)} found (from {tree_size:,} log entries, {bimi_count} BIMI)\n")
    print("=" * 100)

    for i, c in enumerate(sorted(gov_certs, key=lambda x: x["timestamp"], reverse=True), 1):
        validity = is_valid(c["not_after"])
        precert = " [precert]" if c["is_precert"] else ""
        org = c["subject_org"] or c["subject_cn"] or "(unknown)"
        location = ", ".join(filter(None, [c["subject_locality"], c["subject_state"], c["subject_country"]]))
        domains = c["sans"]

        print(f"\n#{i}  {org}  [{validity}]{precert}")
        print(f"    Serial:       {c['serial']}")
        print(f"    Fingerprint:  {c['fingerprint']}")
        print(f"    Issuer:       {c['issuer_org']}  (CN: {c['issuer_cn']})")
        print(f"    Valid:        {fmt_date(c['not_before'])} → {fmt_date(c['not_after'])}")
        print(f"    Location:     {location}")
        print(f"    Domains:      {', '.join(domains[:5])}{f' (+{len(domains)-5} more)' if len(domains) > 5 else ''}")
        print(f"    CT Log:       entry {c['index']}  ({fmt_date(c['timestamp'])})")
        print("-" * 100)

    # Summary
    if gov_certs:
        orgs = {c["subject_org"] for c in gov_certs if c["subject_org"]}
        issuers = {c["issuer_org"] for c in gov_certs if c["issuer_org"]}
        countries = {c["subject_country"] for c in gov_certs if c["subject_country"]}
        valid_count = sum(1 for c in gov_certs if is_valid(c["not_after"]) == "valid")
        precert_count = sum(1 for c in gov_certs if c["is_precert"])

        print(f"\nSummary:")
        print(f"  Total certs:      {len(gov_certs)}  ({valid_count} valid, {len(gov_certs) - valid_count} expired)")
        print(f"  Precerts:         {precert_count}")
        print(f"  Unique orgs:      {len(orgs)}")
        print(f"  Issuers:          {', '.join(sorted(issuers))}")
        print(f"  Countries:        {', '.join(sorted(countries))}")


if __name__ == "__main__":
    main()
