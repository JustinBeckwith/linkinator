import https from 'node:https';
import type { AddressInfo } from 'node:net';

const key = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCUNFZV59cYmfju
TO/9PtKFz9zN7GAYy2HvNS3gHKw+Eoit1jY6RxBNC1V4BBvJn/RKjaFjUK8KYQd7
f4Qbxs7NOC0SgrO0NvWENpXjc4bOExdWGtXMyjeCV7/X4t0IdOnKv9S3vjbtWXni
GFstmCui3dw30PNyyD53zM0UNyf7XdboFvXO3saHyQ05GiF76TtM1tB/LW2X+6A/
U4ZXqxozGZllq3rlEwSKfemNPXOuygz2fXqpAZFezDr1ITOUFpRpSiuDPGV8fj1l
rkevSM4h3Q/TxOwF8k5PsLs0QF4F8FXiBiqlgHGhmBcYyrhLPxEBx9yYeI5UJcZP
Av66ST+JAgMBAAECggEADk3aXt56bdkPlAV4PM2zUT+5mKT1tfLsVAOCluDBlZih
mUCleXy6I6uCP2wLGAvgjtEKaHzlNhfdGmP5dtpag6dmP0T+7fgHfJAtqZcxBcMF
M7XxmHtUffe08BPpADvThFJ9SBI7eC9UgphV9Ym8PXMTIg6Abr3JvLOXQBoeOWYk
vyEY0HM0c5T5e577qaBRBZXgHLpl4BDXnUOWHlUyclNl2m7kg60LtXlUgpDFdmQJ
wvNieYXLR3oMdKA2CCPRQNfXuJqNvtVwqp5FwML5o7E6VoLuZcRNraYgVP2/jA8F
KUlUiceH9ZdvpFOwnUvg+qmM/5BGRebadPYIKgalQQKBgQDHvbj/tfjgC8Po8gZr
S2SExmTQfYUdsFPXlAgjXwJKkJqI7kWaSBZ5uVVxsbbGj599JRHxDkx970YpsIi4
9SHAQuL6ETLI4DskPGNmkJ4YJAWnpuK+Xan0SeccRD9aYKgtfnRMt/J8LqFeJtZ5
+od8yeL+7rCNVokuqM7abHWDyQKBgQC98pPpo99sevseAsBt4xiz4NQLm4vi9Lv0
9hlDCDpz/syABNUPl+EpoMRsGsrirgRTKUYLFnwepowTQQ7FoatFMRGRMa0ULyRv
jSEJYLpeDz/t8g6LV4Cviqt5oLYQU4K9+Ig0znwGbqR+iywfUHrHbcatbRpTReZG
90Opq/o9wQKBgB9l5XTc6BhgARXXJccr/MsaXLKhaJF4LFXRAU5+GuAZxxELU4mj
F1VfGt1acD7aSNnlP+LCuqd5O3BGPdfFQN72JLPmjDMjfGh/zahLx25IC1OFWlNO
ae7qxxecatEMLKOqIyIEMGvw8JDaThCynyWwnqwwXTR6i+n3wzx2nCpxAoGAJEXF
jzFXAh0+BQ4bdyCN4BPICmtqvC1mEzJHwrA4kVwP60aA9VhYjB2CRO6c3crDUqoo
EQf7LdM6Hpcm3gCwdycWprZoydjyyUaXD3ZkQIADAkpeEqfkECGX+0MAYX/BEMv8
HrFrp8LLMMsc4uH4gErrTMTv6QUJI3Ymeqk3wUECgYEAu2LK3ZqTscyaO8M46lS6
j6AzR7IAQVHUBURx57a2PrXFH9rNQR+kmUqN8Vt2wuUZ7Rz6O4syPNJiZa/kO7Lb
WmhppNZtHW7tTURPK1zriRD4E0/oYVBNCfTH+NXROviBgNvfMZSnINksh18DsDly
zMrNLpvpO+925gialIvg+X8=
-----END PRIVATE KEY-----`;

const cert = `-----BEGIN CERTIFICATE-----
MIIDJTCCAg2gAwIBAgIUG4X4D3qhddVoOmerTmVLb+WhCcowDQYJKoZIhvcNAQEL
BQAwFDESMBAGA1UEAwwJbG9jYWxob3N0MB4XDTI2MDYyMDE4MDExOFoXDTM2MDYx
NzE4MDExOFowFDESMBAGA1UEAwwJbG9jYWxob3N0MIIBIjANBgkqhkiG9w0BAQEF
AAOCAQ8AMIIBCgKCAQEAlDRWVefXGJn47kzv/T7Shc/czexgGMth7zUt4BysPhKI
rdY2OkcQTQtVeAQbyZ/0So2hY1CvCmEHe3+EG8bOzTgtEoKztDb1hDaV43OGzhMX
VhrVzMo3gle/1+LdCHTpyr/Ut7427Vl54hhbLZgrot3cN9Dzcsg+d8zNFDcn+13W
6Bb1zt7Gh8kNORohe+k7TNbQfy1tl/ugP1OGV6saMxmZZat65RMEin3pjT1zrsoM
9n16qQGRXsw69SEzlBaUaUorgzxlfH49Za5Hr0jOId0P08TsBfJOT7C7NEBeBfBV
4gYqpYBxoZgXGMq4Sz8RAcfcmHiOVCXGTwL+ukk/iQIDAQABo28wbTAdBgNVHQ4E
FgQUhvZVV7FTUBiHtQkemRttxKhlN3gwHwYDVR0jBBgwFoAUhvZVV7FTUBiHtQke
mRttxKhlN3gwDwYDVR0TAQH/BAUwAwEB/zAaBgNVHREEEzARgglsb2NhbGhvc3SH
BH8AAAEwDQYJKoZIhvcNAQELBQADggEBAHSipj73vLCq38GHU4o6bsqzBMyQlROo
rhEPcnykHuymtD/i7/vPNKm/W9j+ail87Ti2+ycsOz0NLjSi/q0w4sPuakxxVOcK
+GcPBhVgnQzAMdYe7EyIO0Ykz3dAVS7iZ5tAtRHUErWv47mMS6rAH2Q5KgTKF2Tv
sj2IOOF4XuTm0YTtxtzKp1Q/VNqlT8T1Ot5E1fWrOYtrJ4X0EoJt6Z2uwKgbxfQs
0HRxEiZSUKLmWoWIfwrXRycZ/Wud+VQB6WuTMyq41cjgpBzwN2WVotIzGMQbS2eX
O1LJygrJG2+no3bUkp6OnzTsBwKG3h9tqvkbDRXy7ukJLariMKx02+w=
-----END CERTIFICATE-----`;

export async function startSelfSignedServer() {
	const server = https.createServer({ key, cert }, (_req, res) => {
		res.writeHead(200, { 'Content-Type': 'text/html' });
		res.end('<html><body>ok</body></html>');
	});

	await new Promise<void>((resolve) => {
		server.listen(0, '127.0.0.1', resolve);
	});

	const addr = server.address() as AddressInfo;
	return {
		url: `https://127.0.0.1:${addr.port}/`,
		close: () =>
			new Promise<void>((resolve, reject) => {
				server.close((error) => {
					if (error) {
						reject(error);
						return;
					}
					resolve();
				});
			}),
	};
}
