import json, urllib.request
import pandas as pd
import os
# pick a sample file
p = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'dataset', 'Acetone', '1.tsv'))
# read tab-separated, skip header rows
try:
    df = pd.read_csv(p, sep='\t', skiprows=8, header=None)
    signal = df.iloc[:,1].astype(float).tolist()
except Exception as e:
    print('Failed reading sample:', e)
    signal = [0.0]
body = json.dumps({'signal': signal}).encode('utf-8')
req = urllib.request.Request('http://127.0.0.1:6004/predict', data=body, headers={'Content-Type':'application/json'})
try:
    with urllib.request.urlopen(req, timeout=10) as resp:
        print('Status:', resp.status)
        print(resp.read().decode('utf-8'))
except Exception as e:
    print('Request failed:', e)
