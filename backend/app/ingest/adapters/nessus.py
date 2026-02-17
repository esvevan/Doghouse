from __future__ import annotations

from collections.abc import Iterator
from xml.etree.ElementTree import iterparse

from app.ingest.normalize import (
    AssetRecord,
    FindingRecord,
    InstanceRecord,
    ServiceRecord,
    normalize_hostname,
    normalize_ip,
    truncate_evidence,
    utcnow,
)

SEVERITY_MAP = {
    "0": "info",
    "1": "low",
    "2": "medium",
    "3": "high",
    "4": "critical",
}


def parse_nessus_xml(path: str) -> Iterator[AssetRecord | ServiceRecord | FindingRecord | InstanceRecord]:
    context = iterparse(path, events=("end",))
    for _, elem in context:
        if elem.tag != "ReportHost":
            continue

        now = utcnow()
        report_host_name = elem.attrib.get("name", "")
        maybe_ip = None
        hostnames: list[str] = []

        host_props = elem.find("HostProperties")
        if host_props is not None:
            for tag in host_props.findall("tag"):
                name = tag.attrib.get("name")
                val = (tag.text or "").strip()
                if name in {"host-ip", "host-fqdn", "netbios-name"} and val:
                    if name == "host-ip":
                        maybe_ip = val
                    else:
                        hn = normalize_hostname(val)
                        if hn:
                            hostnames.append(hn)

        if not maybe_ip:
            try:
                maybe_ip = normalize_ip(report_host_name)
            except Exception:
                maybe_ip = None
                hn = normalize_hostname(report_host_name)
                if hn:
                    hostnames.append(hn)

        if not maybe_ip:
            elem.clear()
            continue

        ip = normalize_ip(maybe_ip)
        primary = hostnames[0] if hostnames else None
        yield AssetRecord(ip=ip, primary_hostname=primary, hostnames=sorted(set(hostnames)), seen_at=now)

        for item in elem.findall("ReportItem"):
            plugin_id = item.attrib.get("pluginID")
            if not plugin_id:
                continue

            svc_name = item.attrib.get("svc_name")
            proto = (item.attrib.get("protocol") or "tcp").lower()
            port = int(item.attrib.get("port", "0"))

            if port > 0:
                yield ServiceRecord(
                    asset_ip=ip,
                    proto=proto,
                    port=port,
                    name=svc_name,
                    product=item.attrib.get("pluginFamily"),
                    version=None,
                    banner=None,
                    seen_at=now,
                )

            severity = SEVERITY_MAP.get(item.attrib.get("severity", "0"), "info")
            title = item.attrib.get("pluginName") or f"Nessus plugin {plugin_id}"
            description = (item.findtext("description") or "").strip() or None
            remediation = (item.findtext("solution") or "").strip() or None
            plugin_output = (item.findtext("plugin_output") or "").strip() or None
            refs = []
            for key in ("see_also", "cve", "bid"):
                txt = (item.findtext(key) or "").strip()
                if txt:
                    refs.append(f"{key}:{txt}")

            finding_key = f"nessus:{plugin_id}"
            yield FindingRecord(
                finding_key=finding_key,
                title=title,
                severity=severity,
                description=description,
                remediation=remediation,
                references=refs,
                scanner="nessus",
                scanner_id=plugin_id,
            )
            yield InstanceRecord(
                finding_key=finding_key,
                asset_ip=ip,
                service_proto=proto if port > 0 else None,
                service_port=port if port > 0 else None,
                evidence_snippet=truncate_evidence(plugin_output),
                status="open",
                seen_at=now,
            )

        elem.clear()