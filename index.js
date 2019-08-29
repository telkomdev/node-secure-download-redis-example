const express = require('express');
const redis = require('redis');
const Minio = require('minio');
const multer = require('multer');
const uuid = require('uuid/v4');
require('dotenv').config();

const redisClient = redis.createClient({host: '127.0.0.1', port: 6379, password: 'devpass'});

const minioClient = new Minio.Client({
    endPoint: '127.0.0.1',
    port: 9000,
    useSSL: false,
    accessKey: 'minion',
    secretKey: '123456789'
});

redisClient.on('error', (err) => {
	console.log(err);
});

minioClient.bucketExists('test-bucket', function(err, exists) {
	if (err) {
	  return console.log(err)
	}

	if (!exists) {
	  	minioClient.makeBucket('test-bucket', 'ap-southeast-1', (err) => {
			if (err) {
				console.log('minio error '+err);
			}
		});
	}
});

const PORT = process.env.PORT;

const app = express();

app.get('/', (req, res, next) => {
	res.json({'hello': 'helloooo'});
});

app.post('/upload', multer({storage: multer.memoryStorage()}).single("file"), async (req, res, next) => {
	if (req.file) {
		var originalname = req.file.originalname.split(' ');
		const fileName = originalname.join('_');
		try {
			await minioClient.putObject('test-bucket', fileName, req.file.buffer);

			// get url
			const url = await minioClient.presignedGetObject('test-bucket', fileName);

			var id = uuid();
			// link valid for 3 minutes (180 seconds)
			// save link to redis
			redisClient.setex(id, 180, url, (err, reply) => {
				if (err) {
					return res.json({'success': false, 'message': err});
				}
				return res.json({'success': true, 'message': id});
			});
		} catch(err) {
			return res.json({'success': false, 'message': err});
		}
	}
});

app.get('/download', async (req, res, next) => {
	if (!req.query.id) {
		return res.json({'success': false, 'message': 'required file id'});
	}

	const fileId = req.query.id;
	try {
		redisClient.get(fileId, async (err, value) => {
			if (err) {
				return res.json({'success': false, 'message': err});
			}

			if (value) {
				// remove key after file downloade once
				redisClient.del(fileId);

				//return res.json({'success': true, 'message': value});
				return res.redirect(301, value);
			}

			return res.json({'success': false, 'message': 'link is not valid anymore'});
		});
	} catch(err) {
		return res.json({'success': false, 'message': err.message});
	}
});

app.listen(PORT, () => {
	console.log(`app listen on port ${PORT}`);
});

