from __future__ import annotations

from collections.abc import Iterator
from xml.etree.ElementTree import iterparse

from app.ingest.normalize import AssetRecord, ServiceRecord, normalize_hostname, normalize_ip, utcnow


def parse_nmap_xml(path: str) -> Iterator[AssetRecord | ServiceRecord]:
    now = utcnow()
    context = iterparse(path, events=("end",))
    for _, elem in context:
        if elem.tag != "host":
            continue

        ip = None
        hostnames: list[str] = []
        for child in elem:
            if child.tag == "address" and child.attrib.get("addrtype") in {"ipv4", "ipv6"}:
                ip = child.attrib.get("addr")
            if child.tag == "hostnames":
                for h in child.findall("hostname"):
                    hn = normalize_hostname(h.attrib.get("name"))
                    if hn:
                        hostnames.append(hn)

        if not ip:
            elem.clear()
            continue

        norm_ip = normalize_ip(ip)
        primary = hostnames[0] if hostnames else None
        yield AssetRecord(
            ip=norm_ip,
            primary_hostname=primary,
            hostnames=sorted(set(hostnames)),
            seen_at=now,
        )

        ports = elem.find("ports")
        if ports is not None:
            for p in ports.findall("port"):
                if p.find("state") is not None and p.find("state").attrib.get("state") != "open":
                    continue
                proto = (p.attrib.get("protocol") or "tcp").lower()
                portid = int(p.attrib.get("portid", "0"))
                svc = p.find("service")
                name = svc.attrib.get("name") if svc is not None else None
                product = svc.attrib.get("product") if svc is not None else None
                version = svc.attrib.get("version") if svc is not None else None
                banner = svc.attrib.get("extrainfo") if svc is not None else None
                yield ServiceRecord(
                    asset_ip=norm_ip,
                    proto=proto,
                    port=portid,
                    name=name,
                    product=product,
                    version=version,
                    banner=banner,
                    seen_at=now,
                )
        elem.clear()