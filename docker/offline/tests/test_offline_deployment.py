"""Server archive deployment contracts; no real containers or model inference."""
import hashlib
import io
import os
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[3]


class OfflineDeploymentTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="offline-deployment-tests-")
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.archive = self.base / "release with spaces.tar.gz"
        self.dest = self.base / "installed with spaces"
        self.bin = self.base / "bin"
        self.bin.mkdir()
        (self.bin / "docker").write_text("""#!/bin/sh
case "$*" in
  'info') exit 0;;
  'info --format '* ) echo linux/amd64;;
  'compose version') echo 'Docker Compose v2';;
  *) echo 'Unexpected Docker action before installer' >&2; exit 77;;
esac
""")
        (self.bin / "docker").chmod(0o755)
        self.env = {**os.environ, "PATH": str(self.bin) + os.pathsep + os.environ["PATH"]}
        self.env.pop("SIMULATOR_PROJECT", None)

    def bundle(self, *, restore=False, corrupt=False, extra=None, bad_sidecar=False, failed_install=False):
        install = b'''#!/bin/bash
printf '%s|%s' "${1:-}" "$SIMULATOR_PROJECT" > "$(dirname "$0")/install-invoked.txt"
exit ''' + (b"1\n" if failed_install else b"0\n")
        files = {name: b"synthetic fixture\n" for name in (
            "common.sh", "compose.yml", "images.env", "images.tar", "settings.env.example", "verify.sh")}
        files["install.sh"] = install
        if restore:
            files.update({"backup/database.sql": b"synthetic SQL", "backup/app-data.tar": b"synthetic data"})
        files["SHA256SUMS"] = "".join(
            f"{hashlib.sha256(data).hexdigest()}  ./{name}\n" for name, data in files.items()).encode()
        if corrupt:
            files["images.tar"] = b"damaged"
        with tarfile.open(self.archive, "w:gz") as tar:
            for name, data in files.items():
                member = tarfile.TarInfo("simulator112-offline/" + name)
                member.size = len(data)
                member.mode = 0o755 if name.endswith(".sh") else 0o600
                tar.addfile(member, io.BytesIO(data))
            if extra is not None:
                tar.addfile(extra, io.BytesIO(b""))
        digest = "0" * 64 if bad_sidecar else hashlib.sha256(self.archive.read_bytes()).hexdigest()
        Path(str(self.archive) + ".sha256").write_text(f"{digest}  {self.archive.name}\n")

    def deploy(self, *args):
        return subprocess.run(["bash", str(ROOT / "docker/offline/deploy.sh"), str(self.archive),
                               "--directory", str(self.dest), *args],
                              env=self.env, cwd=self.base, text=True, capture_output=True, timeout=30)

    def test_extract_verify_and_invoke_existing_installer(self):
        self.bundle()
        result = self.deploy()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual((self.dest / "install-invoked.txt").read_text(), "|simulator112_offline")
        self.assertEqual(list(self.base.glob(".simulator112-deploy.*")), [])

    def test_restore_is_explicit_and_passed_to_installer(self):
        self.bundle(restore=True)
        result = self.deploy("--restore", "--project", "training")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual((self.dest / "install-invoked.txt").read_text(), "--restore|training")

    def test_restore_requires_backup_before_installation(self):
        self.bundle()
        result = self.deploy("--restore")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("No database backup", result.stderr)
        self.assertFalse(self.dest.exists())

    def test_existing_installation_is_preserved(self):
        self.bundle()
        self.dest.mkdir()
        (self.dest / ".env").write_text("KEEP_CREDENTIALS")
        result = self.deploy()
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual((self.dest / ".env").read_text(), "KEEP_CREDENTIALS")

    def test_transfer_checksum_failure_prevents_extraction(self):
        self.bundle(bad_sidecar=True)
        result = self.deploy()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("checksum mismatch", result.stderr)
        self.assertFalse(self.dest.exists())

    def test_embedded_checksum_failure_prevents_installer_execution(self):
        self.bundle(corrupt=True)
        result = self.deploy()
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(self.dest.exists())

    def test_traversal_and_symlink_members_are_rejected(self):
        for linked in (False, True):
            with self.subTest(linked=linked):
                member = tarfile.TarInfo("simulator112-offline/escape" if linked else "simulator112-offline/../outside")
                if linked:
                    member.type = tarfile.SYMTYPE
                    member.linkname = str(self.base / "outside")
                self.bundle(extra=member)
                result = self.deploy()
                self.assertNotEqual(result.returncode, 0)
                self.assertFalse(self.dest.exists())
                self.assertFalse((self.base / "outside").exists())

    def test_insufficient_space_is_reported_before_extraction(self):
        self.bundle()
        (self.bin / "df").write_text("#!/bin/sh\nprintf 'Filesystem 1024-blocks Used Available Capacity Mounted on\\nfake 10 10 0 100%% /fake\\n'\n")
        (self.bin / "df").chmod(0o755)
        result = self.deploy()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Not enough space", result.stderr)
        self.assertFalse(self.dest.exists())

    def test_failed_installation_retains_files_for_diagnosis(self):
        self.bundle(failed_install=True)
        result = self.deploy()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Files remain", result.stderr)
        self.assertTrue((self.dest / "install-invoked.txt").is_file())


if __name__ == "__main__":
    unittest.main()
