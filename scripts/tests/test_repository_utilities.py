"""Relocated helpers keep their project root without models or a live database."""
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[2]


class RelocatedUtilityTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="repository-utilities-")
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.project = self.base / "project with spaces"
        (self.project / "scripts").mkdir(parents=True)
        self.other = self.base / "unrelated working directory"
        self.other.mkdir()

    def copy_helper(self, name):
        destination = self.project / "scripts" / name
        shutil.copyfile(ROOT / "scripts" / name, destination)
        return destination

    def run_probe(self, code, *args):
        env = {key: value for key, value in os.environ.items() if key not in {"PYTHONPATH", "DATABASE_URL"}}
        return subprocess.run([sys.executable, "-c", code, *map(str, args)],
                              cwd=self.other, env=env, capture_output=True, text=True, timeout=15)

    def test_static_tts_writes_project_public_assets_from_unrelated_cwd(self):
        helper = self.copy_helper("generate_static_tts.py")
        core = self.project / "backend" / "core"
        core.mkdir(parents=True)
        for folder in (core, core.parent):
            (folder / "__init__.py").touch()
        (core / "tts_v2.py").write_text(
            "class Stub:\n"
            "    def concatenate_tts(self, texts, speaker):\n"
            "        return b'RIFFsynthetic-test-audio'\n"
            "tts_engine_v2 = Stub()\n")
        result = self.run_probe("import runpy,sys; runpy.run_path(sys.argv[1],run_name='__main__')", helper)
        self.assertEqual(result.returncode, 0, result.stderr)
        files = list((self.project / "frontend_react/public/audio/tts").glob("*.wav"))
        self.assertEqual(len(files), 10)
        self.assertTrue(all(path.read_bytes() == b"RIFFsynthetic-test-audio" for path in files))
        self.assertFalse((self.other / "frontend_react").exists())

    def test_demo_helper_reads_project_env_without_running_seeder(self):
        helper = self.copy_helper("seed_demo.py")
        (self.project / ".env").write_text("RELOCATED_UTILITY_PROBE=from-project-env\n")
        code = ("import os,runpy,sys; os.environ.pop('RELOCATED_UTILITY_PROBE',None); "
                "runpy.run_path(sys.argv[1],run_name='path_probe'); "
                "assert os.environ['RELOCATED_UTILITY_PROBE']=='from-project-env'; "
                "assert sys.path[0]==sys.argv[2]")
        result = self.run_probe(code, helper, self.project)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(list(self.project.rglob("*.db")))

    def test_private_env_initializer_uses_project_root_without_overwrite(self):
        helper = self.copy_helper("setup_env.py")
        (self.project / ".env.example").write_bytes((ROOT / ".env.example").read_bytes())
        code = "import runpy,sys; sys.argv=[sys.argv[1], '--init']; runpy.run_path(sys.argv[0],run_name='__main__')"
        result = self.run_probe(code, helper)
        self.assertEqual(result.returncode, 0, result.stderr)
        created = self.project / ".env"
        self.assertTrue(created.is_file())
        self.assertEqual(created.stat().st_mode & 0o777, 0o600)
        original = created.read_bytes()
        self.assertNotEqual(self.run_probe(code, helper).returncode, 0)
        self.assertEqual(created.read_bytes(), original)
        self.assertFalse((self.other / ".env").exists())

    def test_legacy_release_copies_helper_with_its_project_relative_layout(self):
        self.copy_helper("setup_env.py")
        shutil.copyfile(ROOT / "scripts/pack_release.sh", self.project / "scripts/pack_release.sh")
        for filename in ("docker-compose.prod.yml", ".env.example"):
            if filename == ".env.example":
                (self.project / filename).write_bytes((ROOT / filename).read_bytes())
            else:
                (self.project / filename).write_text("synthetic fixture\n")
        (self.project / "docs/operations").mkdir(parents=True)
        (self.project / "docs/operations/deployment.md").write_text("Release instructions\n")
        (self.project / "scripts/generate_certs.sh").write_text("#!/bin/sh\n")
        binaries = self.base / "bin"
        binaries.mkdir()
        docker = binaries / "docker"
        docker.write_text("#!/bin/sh\nif [ \"$1\" = save ]; then : > \"$3\"; fi\n")
        docker.chmod(0o755)
        result = subprocess.run(["bash", "scripts/pack_release.sh"], cwd=self.project,
                                env={**os.environ, "PATH": f"{binaries}:{os.environ['PATH']}"},
                                capture_output=True, text=True, timeout=15)
        self.assertEqual(result.returncode, 0, result.stderr)
        helper = self.project / "release/scripts/setup_env.py"
        self.assertEqual(helper.read_bytes(), (ROOT / "scripts/setup_env.py").read_bytes())
        code = "import runpy,sys; sys.argv=[sys.argv[1], '--init']; runpy.run_path(sys.argv[0],run_name='__main__')"
        result = self.run_probe(code, helper)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue((self.project / "release/.env").is_file())
        self.assertFalse((self.other / ".env").exists())

    def test_database_policy_uses_data_without_hiding_existing_legacy_rows(self):
        import importlib.util
        module_path = ROOT / "backend/core/paths.py"
        spec = importlib.util.spec_from_file_location("layout_paths_probe", module_path)
        paths = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(paths)
        expected = self.project / "data/112_simulator.db"
        self.assertEqual(paths.local_database_path(self.project), expected)
        legacy = self.project / "112_simulator.db"
        legacy.write_bytes(b"existing original data")
        self.assertEqual(paths.local_database_path(self.project), legacy)
        self.assertEqual(legacy.read_bytes(), b"existing original data")
        expected.parent.mkdir()
        expected.write_bytes(b"explicit canonical data")
        self.assertEqual(paths.local_database_path(self.project), expected)
        self.assertEqual(legacy.read_bytes(), b"existing original data")

    def test_fresh_engine_creates_database_inside_data_from_unrelated_cwd(self):
        package = self.project / "backend/core"
        package.mkdir(parents=True)
        for directory in (package, package.parent):
            (directory / "__init__.py").touch()
        shutil.copyfile(ROOT / "backend/database.py", self.project / "backend/database.py")
        shutil.copyfile(ROOT / "backend/core/paths.py", package / "paths.py")
        code = ("import sys,asyncio,pathlib\nsys.path.insert(0,sys.argv[1])\n"
                "from backend.database import engine\nfrom sqlalchemy import text\n"
                "assert pathlib.Path(engine.url.database)==pathlib.Path(sys.argv[1])/'data/112_simulator.db'\n"
                "async def connect():\n"
                "    async with engine.connect() as connection:\n"
                "        assert (await connection.execute(text('SELECT 1'))).scalar()==1\n"
                "    await engine.dispose()\n"
                "asyncio.run(connect())")
        result = self.run_probe(code, self.project)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue((self.project / "data/112_simulator.db").is_file())
        self.assertFalse((self.project / "112_simulator.db").exists())



if __name__ == "__main__":
    unittest.main()
