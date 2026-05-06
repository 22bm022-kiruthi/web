import requests
try:
    r = requests.post('http://127.0.0.1:5003/api/predict', json={'signal':[1,2,3,4,5]})
    print('STATUS', r.status_code)
    print(r.text)
except Exception as e:
    print('ERR', e)
