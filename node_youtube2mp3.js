var youtubeStream = require('youtube-audio-stream')
const express = require('express')
const app = express()
const fs = require('fs');
const ytdl = require('ytdl-core');
var request = require('request');
var randomstring = require("randomstring");
var sanitize = require("sanitize-filename");
var ffmpeg = require('fluent-ffmpeg')
var ffmpegParams = {
    format: 'mp3',
    bitrate: 320,
    seek: 0,
    duration: null
}

var _jobs = {}
var _file_to_task = {}
var FILES_LOCATION = './temp-downloads'

function saveBufferAsFile(res, writer, filename, task) {
    var filepath = FILES_LOCATION+'/'+filename;
    if (!fs.existsSync(FILES_LOCATION)) fs.mkdirSync(FILES_LOCATION);
    writer.pipe(fs.createWriteStream(filepath)).on('finish', function () {
        console.log('Task complete! Will delete file in 60min')
        task.status = 'completed'
        task.progress = 1
        task.endProgress = 1
        setTimeout(function() {
            task.status = 'deleted'
            try {
                delete _file_to_task[filename]
                fs.unlink(filepath, function() {
                    console.log(filepath + ' deleted')
                });
            } catch (e) {
                console.log(e)
            }
        }, 60*60*1000)
    });
}

function checkExistingTask(filename, curTask) {
    if (_file_to_task[filename] && _jobs[_file_to_task[filename]] &&_jobs[_file_to_task[filename]].status !== 'deleted') {
        // Link task id to same task data
        console.log('Found existing task, linking to it')
        _jobs[curTask.id] = _jobs[_file_to_task[filename]]
        return true
    }

    // If nothing exists we continue with this task and process it
    curTask.filename = filename
    _file_to_task[filename] = curTask.id // Register this task
    return false
}

function createNewFileTask(type) {
    var id = randomstring.generate();
    _jobs[id] = {
        id:id,
        type: type,
        status: 'starting',
        progress: -1,
        endProgress: -1
    }
    return _jobs[id];
}


function downloadYoutube(task, url, filter) {
    return ytdl(url, filter).on('progress', function(chunkLength, downloaded, totalDownload) {
        if (!task) return;
        task.status = 'downloading'
        task.progress = downloaded
        task.endProgress = totalDownload
    });
}

app.use('/static', express.static('public'));
app.set('json spaces', 4);
app.get('/status/:taskId', function (req, res) {
    var server_task = _jobs[req.params.taskId];
    if (!server_task) {
        res.json({id: req.params.taskId, status:'ko', message:'Task not found for id '+req.params.taskId});
        return;
    }
    var task = JSON.parse(JSON.stringify(_jobs[req.params.taskId]));
    if (!task) {
        res.json({id: req.params.taskId, status:'ko', message:'Task not found for id '+req.params.taskId});
        return
    }
    task.originalId = task.id
    task.id = req.params.taskId // Update id as it could not match original one
    res.json(task);
})

app.get('/download/:taskId', function (req, res) {
    var task = _jobs[req.params.taskId]
    if (!task) {
        res.json({id: req.params.taskId, status:'ko', message:'Task not found for id '+req.params.taskId});
        return
    }
    if (task.status !== 'completed') {
        res.json({id: req.params.taskId, status:'ko', message:'Task is not yet completed'});
        return
    }
    var file = FILES_LOCATION+'/'+task.filename;
    if (!fs.existsSync(file)) {
        res.json({id: req.params.taskId, status:'ko', message:'File not found'});
        return
    }
    res.download(file)
})

app.get('/convertToMp3/:videoId', function (req, res) {
    var requestUrl = 'https://www.youtube.com/watch?v=' + req.params.videoId;
    console.log('Getting info of '+ requestUrl + ' ...')
    try {
        var task = createNewFileTask('audio');
        res.json(task);
        ytdl.getInfo(requestUrl, {}, function(err, videosInfos) {
            if (err) {
                console.error("Unable to get video infos:", err);
                task.status = "error";
                return;
            }
            var filename = sanitize(videosInfos.title) + '.mp3';
            if (checkExistingTask(filename, task)) {
                console.log("Task already existst.");
                return
            }

            console.log('Creating ' + filename + ' ...')
            var reader = downloadYoutube(task, requestUrl, {quality: 'highestaudio', filter: 'audioonly'})
            try {
                // FF mpeg is way faster than the download of the mp4, so no need to display progress actually (it's done in parallel)
                var ffMpegWriter = ffmpeg(reader).format(ffmpegParams.format).audioBitrate(ffmpegParams.bitrate)/*.on('progress', function(progress) {
                    console.log('convertion !!!')
                    task.status = 'converting'
                    if (progress) task.progress = progress.targetSize
                    task.endProgress = -1
                })*/;
                saveBufferAsFile(res, ffMpegWriter, filename, task);
            } catch (e) {
                console.error("Error while caling ffmpeg. Make sure it is installed on your server. (accessible via PATH or local dir)")
                console.log(e);
            }
        });
    } catch (e) {
        console.error('convertToMp3 exception: ', e)
    }
});

app.get('/downloadMp4/:videoId', function (req, res) {
    var requestUrl = 'https://www.youtube.com/watch?v=' + req.params.videoId;
    console.log('Getting info of '+ requestUrl + ' ...')
    try {
        var task = createNewFileTask('video');
        res.json(task);
        ytdl.getInfo(requestUrl, {}, function(err, videosInfos) {
            var filename = sanitize(videosInfos.title) + '.mp4';
            if (checkExistingTask(filename, task)) return

            console.log('Creating ' + filename + ' ...')
            var reader = downloadYoutube(task, requestUrl, { filter: (format) => format.container === 'mp4' });
            saveBufferAsFile(res, reader, filename, task);
        });
    } catch (e) {
        console.error(e)
        res.status(500).send(e)
    }
})

app.get('/extractPlaylist/:playlistID', function (req, res) {
    var requestUrl = 'https://www.youtube.com/playlist?list=' + req.params.playlistID;
    console.log('Extracting videos of playlist '+ req.params.playlistID + ' ...');
    var resulstJson = {status: 'ko', playlistId:req.params.playlistID}
    try {
        request(requestUrl, function (error, response, body) {
            if (error) {
                console.log(error)
                resulstJson.message = 'Could not get Playlist page'
                res.json(resulstJson)
                return
            }
            var regexpStr = 'watch\\?v=([0-9A-Za-z\-_]+)(&amp;t=0s)?(&amp;index=([0-9]+))?&amp;list='+req.params.playlistID;
            console.log("Using regexp '"+regexpStr+"' ...")
            var playlistRegexp = new RegExp(regexpStr, 'g');
            var regexp_result;
            var playlistVideos = new Set();
            while ((regexp_result = playlistRegexp.exec(body)) !== null) {
                if (!playlistVideos.has(regexp_result[1])) {
                    playlistVideos.add(regexp_result[1])
                }
            }
            console.log('Videos of playlist: ', playlistVideos);
            resulstJson.videos = Array.from(playlistVideos)
            resulstJson.status = 'ok'
            res.json(resulstJson)
        });
    } catch (e) {
        console.error(e)
        resulstJson.message = 'An exception has occurred'
        res.json(resulstJson)
    }
})

app.get('/', function (req, res) {
    res.sendFile('index.html', {
        root: __dirname + '/',
        dotfiles: 'deny',
        headers: {
            'x-timestamp': Date.now(),
            'x-sent': true,
            'Access-Control-Allow-Origin': 'https://www.youtube.com'
        }
    });
})

app.listen(7788, () => console.log('Listening on port 7788!'))
