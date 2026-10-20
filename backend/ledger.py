"""
Local hash ledger built only from the upstream pure functions in
analysis.hash_verification. Unlike the Streamlit app (per-session memory),
the ledger is kept in build_artifacts/ledger.json on this machine. It records
that a file with these hashes was seen; it is not a trusted timestamp or a
legal chain of custody.

Optional HMAC key: environment variable VERITAS_LEDGER_KEY. Without it,
exports carry a plain SHA-256 digest that only detects accidental change.
"""
import os
import threading

from analysis import hash_verification as hv

from .storage import STORAGE_ROOT, read_json, write_json

LEDGER_PATH = STORAGE_ROOT / "ledger.json"


def ledger_key():
    k = os.environ.get("VERITAS_LEDGER_KEY")
    return k.encode() if k else None


class LedgerStore:
    def __init__(self):
        self.lock = threading.RLock()
        self.records = read_json(LEDGER_PATH) if LEDGER_PATH.exists() else hv.new_ledger()

    def _save(self):
        write_json(LEDGER_PATH, self.records)

    def state(self):
        with self.lock:
            return {"records": self.records, "stats": hv.ledger_stats(self.records),
                    "chain": hv.verify_chain(self.records),
                    "signing": "HMAC-SHA256" if ledger_key() else "SHA-256 digest (unkeyed)"}

    def add(self, path, label, note):
        with self.lock:
            self.records, rec = hv.add_record(self.records, path, label=label, note=note)
            self._save()
            return rec

    def verify(self, path):
        with self.lock:
            return hv.verify_image(self.records, path)

    def export(self):
        with self.lock:
            return hv.export_ledger(self.records, ledger_key())

    def import_(self, data):
        with self.lock:
            merged, report = hv.import_ledger(data, key=ledger_key(), into=self.records)
            if report["accepted"]:
                self.records = merged
                self._save()
            return report

    def clear(self):
        with self.lock:
            self.records = hv.new_ledger()
            self._save()
