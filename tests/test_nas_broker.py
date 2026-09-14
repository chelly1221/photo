import importlib.util, json, tempfile, unittest
from pathlib import Path
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('broker',Path(__file__).parents[1]/'scripts/photo-nas.py')
broker=importlib.util.module_from_spec(spec);spec.loader.exec_module(broker)

class BrokerTests(unittest.TestCase):
    def test_address_and_path_boundaries(self):
        for address in ('127.0.0.1','169.254.169.254','8.8.8.8','100.75.1.1;id'):
            with self.assertRaises(broker.NasError):broker.host(address)
        for path in ('../private','a/../private','/private','a\\private','a\nprivate'):
            with self.assertRaises(broker.NasError):broker.relative(path)
        self.assertEqual(broker.relative('가족 사진/2026'),'가족 사진/2026')

    def test_credentials_are_private_and_failed_auth_is_cleaned(self):
        with tempfile.TemporaryDirectory() as temp,patch.object(broker,'ROOT',Path(temp)),patch.object(broker,'run',return_value=b'obscured'),patch.object(broker,'listing',return_value={'path':'','folders':[],'next':None}):
            value=broker.connect({'host':'100.75.89.101','option':{'protocol':'sftp','port':22,'keys':'host ssh-ed25519 publickey\n'},'owner':'alice','username':'account','password':'secret'})
            directory=Path(temp)/value['connectionId'];config=(directory/'rclone.conf').read_text()
            self.assertIn('known_hosts_file',config);self.assertIn('disable_hashcheck = true',config)
            self.assertNotIn('secret',config);self.assertEqual((directory/'rclone.conf').stat().st_mode&0o077,0)
            with self.assertRaises(broker.NasError):broker.connection(value['connectionId'],'bob')
            with patch.object(broker,'listing',side_effect=broker.NasError('invalid')):
                with self.assertRaises(broker.NasError):broker.connect({'host':'100.75.89.101','option':{'protocol':'smb','port':445},'owner':'alice','username':'account','password':'secret'})
            self.assertEqual(len(list(Path(temp).iterdir())),1)

    def test_remote_names_pagination_and_no_path_escape(self):
        rows=[{'Name':f'폴더 {i:03}','IsDir':True} for i in range(205)]+[{'Name':'../escape','IsDir':True},{'Name':'IPC$','IsDir':True},{'Name':'file.jpg','IsDir':False}]
        with patch.object(broker,'rclone',return_value=json.dumps(rows).encode()):
            first=broker.listing(Path('/unused'),{'protocol':'smb'},'')
            self.assertEqual(len(first['folders']),200);self.assertEqual(first['next'],200)
            second=broker.listing(Path('/unused'),{'protocol':'smb'},'',200)
            self.assertEqual(len(second['folders']),5);self.assertIsNone(second['next'])

    def test_delete_uses_registered_source_and_exact_file_only(self):
        source='11111111-1111-4111-8111-111111111111'
        with tempfile.TemporaryDirectory() as temp,patch.object(broker,'RECORDS',Path(temp)),patch.object(broker,'connection',return_value=(Path('/unused'),{})):
            (Path(temp)/(source+'.json')).write_text(json.dumps({'sourceId':source,'owner':'alice','connectionId':source,'path':'Photos/Family'}))
            request={'sourceId':source,'owner':'alice','relativePath':'2026/photo.jpg','size':123,'mtime':1000}
            with patch.object(broker,'rclone',side_effect=[json.dumps({'IsDir':False,'Size':123,'ModTime':'1970-01-01T00:00:01Z'}).encode(),b'']) as run:
                self.assertEqual(broker.delete_file(request),{'ok':True})
                self.assertEqual(run.call_args_list[1].args[1],['deletefile','nas:Photos/Family/2026/photo.jpg'])
            for invalid in ({'owner':'bob'},{'relativePath':'../other.jpg'},{'relativePath':''}):
                with patch.object(broker,'rclone') as run:
                    with self.assertRaises(broker.NasError):broker.delete_file({**request,**invalid})
                    run.assert_not_called()
            for stat in ({'IsDir':True,'Size':123,'ModTime':'1970-01-01T00:00:01Z'},{'IsDir':False,'Size':999,'ModTime':'1970-01-01T00:00:01Z'},{'IsDir':False,'Size':123,'ModTime':'1970-01-01T00:00:02Z'}):
                with patch.object(broker,'rclone',return_value=json.dumps(stat).encode()) as run:
                    with self.assertRaises(broker.NasError):broker.delete_file(request)
                    self.assertEqual(run.call_count,1)

if __name__=='__main__':unittest.main()
