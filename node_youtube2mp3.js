var youtubeStream = require('youtube-audio-stream')
const express = require('express')
const app = express()
const fs = require('fs');
const ytdl = require('ytdl-core');
var request = require('request');
var https = require('https');
var randomstring = require("randomstring");
var sanitize = require("sanitize-filename");
var shell = require('shelljs');
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

function saveBufferAsFile(res, writer, filename, task, iconPath) {
    var filepath = FILES_LOCATION+'/'+filename;
    if (!fs.existsSync(FILES_LOCATION)) fs.mkdirSync(FILES_LOCATION);
    writer.pipe(fs.createWriteStream(filepath)).on('finish', function () {
        let proceed = () => {
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
                    if (iconPath) {
                        fs.unlink(iconPath, function() {
                            console.log(iconPath + ' deleted')
                        });
                    }
                } catch (e) {
                    console.log(e)
                }
            }, 60*60*1000)
        }
        if (!iconPath) {
            proceed()
        } else {
            console.log("Adding icon ...")
            addIconToFile(task.id, filepath, iconPath, proceed)
        }
    });
}

function runScript(command, sucessCallback, failureCallback) {
    try {
        console.log(`Running command "${command}"`)
        var shellProcess = shell.exec(command, {silent:true, async:true}, (code, stdout, stderr) => {
            if (code == 0) {
                console.log(command+' ended successfully')
                if (sucessCallback) sucessCallback(0, stdout, stderr)
            } else {
                console.log(command+' ended in failure - code='+code)
                console.log(stdout)
                console.log(stderr)
                if (failureCallback) failureCallback(code, stdout, stderr)
            }
        })
    } catch(e) {
        console.log("Exception occured while running", filename, e)
        if (failureCallback) failureCallback(-1, "Ended in exception", ""+e)
    }
}

function addIconToFile(uid, inputFile, iconPath, cb) {
    runScript(`ffmpeg -y -i "${inputFile}" -i "${iconPath}" -map 0:0 -map 1:0 -c copy -id3v2_version 3 -metadata:s:v title="Album cover" -metadata:s:v comment="Cover" "${FILES_LOCATION}/tmp-${uid}.mp3" && rm "${inputFile}" && mv "${FILES_LOCATION}/tmp-${uid}.mp3" "${inputFile}"`, cb, cb)
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

app.get('/convertToMp3/:videoId', async function (req, res) {
    var requestUrl = 'https://www.youtube.com/watch?v=' + req.params.videoId;
    console.log('Getting info of '+ requestUrl + ' ...')
    try {
        var task = createNewFileTask('audio');
        res.json(task);
        try {
            let videosInfos = await ytdl.getInfo(requestUrl, {})
            if (!videosInfos || !videosInfos.videoDetails || !videosInfos.videoDetails.title) {
                console.log("Missing video infos");
                task.status = "error"
                task.message = "Could not retrieve video informations."
                return
            }
            var filename = sanitize(videosInfos.videoDetails.title) + '.mp3';
            if (checkExistingTask(filename, task)) {
                console.log("Task already existst.");
                return
            }

            let videoIconPath = `${FILES_LOCATION}/icon-${req.params.videoId}.jpg`
            let proceed = () => {
                console.log('Creating ' + filename + ' ...')
                var reader = downloadYoutube(task, requestUrl, {
                    quality: 'highestaudio',
                    filter: 'audioonly'
                })
                try {
                    // FF mpeg is way faster than the download of the mp4, so no need to display progress actually (it's done in parallel)
                    var ffMpegWriter = ffmpeg(reader)
                        .format(ffmpegParams.format)
                        .audioBitrate(ffmpegParams.bitrate)
                        /*.on('progress', function(progress) {
                        console.log('convertion !!!')
                        task.status = 'converting'
                        if (progress) task.progress = progress.targetSize
                        task.endProgress = -1
                    })*/;
                    saveBufferAsFile(res, ffMpegWriter, filename, task, videoIconPath);
                } catch (e) {
                    console.error("Error while caling ffmpeg. Make sure it is installed on your server. (accessible via PATH or local dir)")
                    console.log(e);
                }
            }
            const file = fs.createWriteStream(videoIconPath);
            https.get(`https://img.youtube.com/vi/${req.params.videoId}/0.jpg`, function(response) {
                response.pipe(file);
                file.on('finish', function() {
                    file.close(() => {
                        proceed()
                    });
                });
            }).on('error', function(err) { // Handle errors
                console.error("Coulnd not download icon", err)
                fs.unlink(videoIconPath);
                videoIconPath = ""
                proceed()
            });
        } catch (err) {
            console.error("Unable to get video infos:", err);
            task.status = "error";
            return;
        }
    } catch (e) {
        console.error('convertToMp3 exception: ', e)
    }
});

app.get('/downloadMp4/:videoId', async function (req, res) {
    var requestUrl = 'https://www.youtube.com/watch?v=' + req.params.videoId;
    console.log('Getting info of '+ requestUrl + ' ...')
    try {
        var task = createNewFileTask('video');
        res.json(task);
        try {
            let videosInfos = await ytdl.getInfo(requestUrl, {})
            var filename = sanitize(videosInfos.videoDetails.title) + '.mp4';
            if (checkExistingTask(filename, task)) return

            console.log('Creating ' + filename + ' ...')
            var reader = downloadYoutube(task, requestUrl, {
                quality: 'highest', // highestvideo is better but no sound
                filter: (format) => format.container === 'mp4'
            });
            saveBufferAsFile(res, reader, filename, task);
        } catch (err) {
            console.error("Unable to get video infos:", err);
            task.status = "error";
            return;
        }
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
