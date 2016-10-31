import express from 'express';
import busboy from 'connect-busboy';
import ssfile from './ssfile';
import zlib from "zlib";
import config from '../config';
import log from "./log";
import chalk from 'chalk';
import statuses from 'statuses';

const app = express();
app.enable('trust proxy');
app.use((req, resp, next) => {
    let start = Date.now();
    let oldEnd = resp.end;
    resp.end = (chunk, encoding) => {
        let end = Date.now();
        log(`${chalk.blue(req.ip)}\t${end-start}ms\t${resp.statusCode} ${statuses[resp.statusCode].toUpperCase()}\t${req.method} ${req.url}`);
        oldEnd.bind(resp)(chunk, encoding);
    };
    next();
});
app.use(busboy());
app.get('/', (req, resp) => {
    resp.send(config.default_message);
});
app.get('/:id', (req, resp) => {
    ssfile.readFile(req.params.id).then(result => {
        if ('if-modified-since' in req.headers && 
            new Date(req.headers['if-modified-since']).getTime() >= result.dateUploaded.getTime()
        ) {
            resp.status(304).send();
            return;
        }

        let stream = result.stream;
        if (!req.headers['accept-encoding'].includes('gzip'))
            stream = stream.pipe(zlib.createGunzip());
        else 
            resp.set('content-encoding', 'gzip');
        
        resp.set('content-disposition', `inline; filename="${result.originalName}"`);
        resp.set('content-type', result.mimeType);
        resp.set('last-modified', result.dateUploaded);
        stream.pipe(resp);
    }).catch(error => {
        if (!error.code)
            console.log(error);
        else
            resp.status(error.code).send(error.message);
    });
});
app.post('/up', (req, resp) => {
    var apiKey;
    if (!('api-key' in req.headers) || !(config.api_keys.includes(apiKey = req.headers['api-key']))) {
        resp.status(403).send('API KEY INVALID!');
        return;
    }

    req.busboy.on('file', (fieldname, file, filename, encoding, mimetype) => {
        if (fieldname !== 'file')
            return;
        ssfile.writeFile(file, filename, mimetype, config.api_keys.indexOf(apiKey)).then(url => {
            resp.redirect(`/${url}`);
        }).catch(error => {
            if (!error.code)
                console.log(error);
            resp.status(error.code || 500).send(error.message);
        });
    });
    req.pipe(req.busboy);
});
var port, host;
app.listen(port = process.env.PORT || config.port || 3000, host = process.env.HOST || config.host || '0.0.0.0', () => {
    log(`Server started at http://${host}${port == 80 ? '' : `:${port}`}/`);
});