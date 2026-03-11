from __future__ import annotations

import ipaddress
import json
import re
from dataclasses import dataclass
from pathlib import Path


IP_RE = re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b")


@dataclass(slots=True)
class ToolOutputAnalysis:
    tool_name: str
    target_ip: str | None
    discovered_ips: list[str]
    preview_text: str


def read_preview_text(path: Path, limit: int = 131072) -> str:
    return path.read_text(encoding="utf-8", errors="replace")[:limit]


def _normalize_ipv4(value: str) -> str | None:
    try:
        return str(ipaddress.ip_address(value.strip()))
    except ValueError:
        return None


def _extract_ips(text: str) -> list[str]:
    values: list[str] = []
    for match in IP_RE.findall(text):
        normalized = _normalize_ipv4(match)
        if normalized and normalized not in values:
            values.append(normalized)
    return values


def _extract_target_ip(text: str, ips: list[str]) -> str | None:
    patterns = [
        r"Target IP:\s*((?:\d{1,3}\.){3}\d{1,3})",
        r"Target Host:\s*((?:\d{1,3}\.){3}\d{1,3})",
        r'"target_ip"\s*:\s*"((?:\d{1,3}\.){3}\d{1,3})"',
        r'"ip"\s*:\s*"((?:\d{1,3}\.){3}\d{1,3})"',
        r'"host"\s*:\s*"((?:\d{1,3}\.){3}\d{1,3})"',
        r"https?://((?:\d{1,3}\.){3}\d{1,3})",
    ]
    for pattern in patterns:
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if match:
            normalized = _normalize_ipv4(match.group(1))
            if normalized:
                return normalized

    try:
        payload = json.loads(text)
    except json.JSONDecodeError:
        payload = None

    if isinstance(payload, dict):
        for key in ("target_ip", "ip", "host", "target"):
            value = payload.get(key)
            if isinstance(value, str):
                normalized = _normalize_ipv4(value)
                if normalized:
                    return normalized

    if len(ips) == 1:
        return ips[0]
    return None


def infer_tool_name(filename: str, text: str) -> str:
    lowered_name = filename.lower()
    lowered_text = text[:4096].lower()
    patterns = [
        ("nikto", "Nikto"),
        ("nuclei", "Nuclei"),
        ("netexec", "NetExec"),
        ("nxc", "NetExec"),
        ("wpscan", "WPScan"),
        ("ffuf", "ffuf"),
        ("gobuster", "Gobuster"),
        ("dirsearch", "dirsearch"),
        ("feroxbuster", "Feroxbuster"),
        ("whatweb", "WhatWeb"),
    ]
    for needle, label in patterns:
        if needle in lowered_name or needle in lowered_text:
            return label
    return "Tool Output"


def analyze_tool_output(filename: str, path: Path) -> ToolOutputAnalysis:
    preview = read_preview_text(path)
    all_ips = _extract_ips(preview)
    target_ip = _extract_target_ip(preview, all_ips)
    discovered_ips = [ip for ip in all_ips if ip != target_ip]
    return ToolOutputAnalysis(
        tool_name=infer_tool_name(filename, preview),
        target_ip=target_ip,
        discovered_ips=discovered_ips,
        preview_text=preview,
    )
