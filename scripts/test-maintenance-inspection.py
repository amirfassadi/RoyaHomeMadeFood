import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('maintenance', Path(__file__).resolve().parents[1] / 'deploy/inspect-maintenance.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class MaintenanceInspection(unittest.TestCase):
    def test_properties_never_include_environment_or_command(self):
        value = module.properties('ActiveState=active\nExecStart=secret-command\nEnvironment=TOKEN=private\nResult=success\nNRestarts=0')
        self.assertEqual(value, {'ActiveState': 'active', 'Result': 'success', 'NRestarts': '0'})
        self.assertNotIn('secret', str(value))
        self.assertNotIn('private', str(value))

    def test_only_safe_related_timer_names(self):
        self.assertEqual(module.timer_names('certbot.timer enabled\nroya-backup.timer enabled\nother.timer enabled\nsecret;backup.timer enabled\nbackup.service enabled'), ['certbot.timer', 'roya-backup.timer'])

    def test_rotation_omits_paths_and_scripts(self):
        result = module.rotation_policy('/private/customer.log {\n weekly\n rotate 14\n compress\n postrotate\n TOKEN=secret-command\n endscript\n}')
        self.assertEqual(result, {'directives': ['compress', 'weekly'], 'retainedRotations': [14]})


if __name__ == '__main__':
    unittest.main()
