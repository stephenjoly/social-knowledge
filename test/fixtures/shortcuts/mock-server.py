from http.server import HTTPServer,BaseHTTPRequestHandler
import json
from pathlib import Path
out=Path('/private/tmp/social-native-probe-events.jsonl')
class Handler(BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_POST(self):
  try:size=int(self.headers.get('Content-Length','0'))
  except ValueError:size=0
  if size<0 or size>8192:
   self.send_response(400);self.end_headers();return
  body=self.rfile.read(size)
  try:data=json.loads(body)
  except Exception:data={}
  ok=isinstance(data,dict) and data.get('url')=='https://www.instagram.com/reel/shortcuts-native-probe/'
  event={'method':'POST','expectedPath':self.path=='/api/v1/jobs','exactTestUrl':ok,'textUrl':isinstance(data.get('url'),str) if isinstance(data,dict) else False,'dummyKey':self.headers.get('Authorization')=='Bearer LOCAL_TEST_PLACEHOLDER'}
  with out.open('a') as f:f.write(json.dumps(event)+'\n')
  passed=ok and event['dummyKey'] and event['expectedPath']
  result={'received':True,'created':True,'job':{'id':'00000000-0000-4000-8000-000000000001','status':'complete'},'message':'Local native test passed'} if passed else {'error':'probe_request_mismatch'}
  self.send_response(202 if passed else 400);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(json.dumps(result).encode())
HTTPServer(('127.0.0.1',18787),Handler).serve_forever()
