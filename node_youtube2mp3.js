var youtubeStream = require('youtube-audio-stream')
const express = require('express')
const app = express()
const fs = require('fs');
const ytdl = require('ytdl-core');
var randomstring = require("randomstring");
var sanitize = require("sanitize-filename");
var ffmpeg = require('fluent-ffmpeg')
var ffmpegParams = {
    format: 'mp3',
    bitrate: 128,
    seek: 0,
    duration: null
}

var _jobs = {}
var _file_to_task = {}
var FILES_LOCATION = './temp-downloads'

function saveBufferAsFile(res, ffMpegWriter, filename, task) {
    var filepath = FILES_LOCATION+'/'+filename;
    if (!fs.existsSync(FILES_LOCATION)) fs.mkdirSync(FILES_LOCATION);
    ffMpegWriter.on('progress', function(progress) {
        task.status = 'ongoing'
        if (progress) task.progress = progress.targetSize
    });
    ffMpegWriter.pipe(fs.createWriteStream(filepath)).on('finish', function () {
        console.log('Task complete! Will delete file in 10min')
        task.status = 'completed'
        task.progress = 1
        task.downloadUrl = '/download/'+task.id
        task.endProgress = 1
        setTimeout(function() {
            task.status = 'deleted'
            fs.unlink(filepath, function() {
                console.log(filepath + ' deleted')
            });
        }, 10*60*1000)
    });
}

function getExistingTask(filename) {
    if (_file_to_task[filename] && _jobs[_file_to_task[filename]] &&_jobs[_file_to_task[filename]].status !== 'deleted') {
        return _jobs[_file_to_task[filename]]
    }
    return null
}

function createNewFileTask(filename) {
    var id = randomstring.generate();
    _file_to_task[filename] = id
    _jobs[id] = {
        id:id,
        filename: filename,
        status: 'created',
        progress: 0,
        endProgress: -1
    }
    return _jobs[id];
}

app.set('json spaces', 4);
app.get('/status/:taskId', function (req, res) {
    var task = _jobs[req.params.taskId]
    if (!task) {
        res.end({status:'ko', message:'Task not found for id '+req.params.taskId});
        return
    }
    res.end(task);
})

app.get('/download/:taskId', function (req, res) {
    var task = _jobs[req.params.taskId]
    if (!task) {
        res.end({status:'ko', message:'Task not found for id '+req.params.taskId});
        return
    }
    if (task.status !== 'completed') {
        res.end({status:'ko', message:'Task is not yet completed'});
        return
    }
    var file = FILES_LOCATION+'/'+task.filename;
    if (!fs.existsSync(file)) {
        res.end({status:'ko', message:'File not found'});
        return
    }
    res.download(file)
})

app.get('/getmp3/:videoId', function (req, res) {
    var requestUrl = 'https://www.youtube.com/watch?v=' + req.params.videoId;
    console.log('Getting info of '+ requestUrl + ' ...')
    try {
        ytdl.getInfo(requestUrl, {}, function(err, videosInfos) {
            var filename = sanitize(videosInfos.title) + '.mp3';
            var existingTask = getExistingTask(filename);
            if (existingTask !== null) {
                res.json(existingTask);
                return;
            }

            var task = createNewFileTask(filename);
            res.json(task)
            console.log('Creating ' + filename + ' ...')
            var reader = ytdl(requestUrl, {filter: 'audioonly'});
            var ffMpegWriter = ffmpeg(reader).format(ffmpegParams.format).audioBitrate(ffmpegParams.bitrate);
            saveBufferAsFile(res, ffMpegWriter, filename, task);
        });
    } catch (e) {
        console.error(e)
        res.status(500).send(e)
    }
})

app.listen(7788, () => console.log('Listening on port 7788!'))
