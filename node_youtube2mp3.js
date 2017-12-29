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
        console.log('Task complete! Will delete file in 5min')
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
        }, 5*60*1000)
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
    var task = JSON.parse(JSON.stringify(_jobs[req.params.taskId]));
    if (!task) {
        res.json({status:'ko', message:'Task not found for id '+req.params.taskId});
        return
    }
    task.originalId = task.id
    task.id = req.params.taskId // Update id as it could not match original one
    res.json(task);
})

app.get('/download/:taskId', function (req, res) {
    var task = _jobs[req.params.taskId]
    if (!task) {
        res.json({status:'ko', message:'Task not found for id '+req.params.taskId});
        return
    }
    if (task.status !== 'completed') {
        res.json({status:'ko', message:'Task is not yet completed'});
        return
    }
    var file = FILES_LOCATION+'/'+task.filename;
    if (!fs.existsSync(file)) {
        res.json({status:'ko', message:'File not found'});
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
            var filename = sanitize(videosInfos.title) + '.mp3';
            if (checkExistingTask(filename, task)) return

            console.log('Creating ' + filename + ' ...')
            var reader = downloadYoutube(task, requestUrl, {filter: 'audioonly'})
            // FF mpeg is way faster than download so no need to get progress actually (plus it's done in parallel)
            var ffMpegWriter = ffmpeg(reader).format(ffmpegParams.format).audioBitrate(ffmpegParams.bitrate)/*.on('progress', function(progress) {
                console.log('convertion !!!')
                task.status = 'converting'
                if (progress) task.progress = progress.targetSize
                task.endProgress = -1
            })*/;
            saveBufferAsFile(res, ffMpegWriter, filename, task);
        });
    } catch (e) {
        console.error(e)
        res.status(500).send(e)
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

app.listen(7788, () => console.log('Listening on port 7788!'))
