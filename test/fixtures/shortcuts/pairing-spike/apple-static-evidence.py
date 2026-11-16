#!/usr/bin/env python3
"""Read ONLY Apple-installed system image constants. No personal Shortcuts access.

Prints selected static action-definition strings, not a serialized native export.
The map/mapping parser avoids loading frameworks or invoking the Shortcuts runtime.
"""
import json
import re
import struct
from pathlib import Path

ROOT = Path("/System/Volumes/Preboot/Cryptexes/OS/System/Library/dyld")
IMAGE = "/System/Library/PrivateFrameworks/WorkflowKit.framework/Versions/A/WorkflowKit"
ANCHORS = ["Gets a file or folder by a relative path, starting at a folder you choose.",
           "WFSaveFileAction"]


def extract():
    mapping = (ROOT / "dyld_shared_cache_arm64e.map").read_text()
    match = re.search(re.escape(IMAGE) + r"\n\s+__TEXT (0x[0-9A-F]+) -> (0x[0-9A-F]+)", mapping)
    if match is None:
        raise RuntimeError("System image map changed; inspect static bundle definitions manually")
    start, end = [int(x, 16) for x in match.groups()]
    for path in sorted(ROOT.glob("dyld_shared_cache_arm64e*")):
        if path.suffix in (".map", ".atlas"):
            continue
        with path.open("rb") as file:
            header = file.read(32)
            if not header.startswith(b"dyld"):
                continue
            offset, count = struct.unpack_from("<II", header, 16)
            if count > 64:
                raise RuntimeError("Unexpected system mapping count")
            file.seek(offset)
            regions = [struct.unpack("<QQQII", file.read(32)) for _ in range(count)]
            for address, size, file_offset, _, _ in regions:
                if address <= start and end <= address + size:
                    file.seek(file_offset + start - address)
                    strings = [s.decode() for s in re.findall(rb"[\x20-\x7e]{6,}", file.read(end - start))]
                    excerpts = []
                    for anchor in ANCHORS:
                        index = strings.index(anchor)
                        excerpts.append(strings[index:index + 27])
                    return {"sourceImage": IMAGE, "sourceCache": path.name,
                        "scope": "Apple system static strings only; not native execution or bookmark evidence",
                        "excerpts": excerpts}
    raise RuntimeError("System image region not found")


if __name__ == "__main__":
    print(json.dumps(extract(), indent=2))
