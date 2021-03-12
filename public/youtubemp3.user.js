// ==UserScript==
// @name           Youtube-MP3 button
// @description    Button to download mp3s directly from youtube when possible, using the youtube-mp3.org service.
// @include        https://*.youtube.*
// @include        http://*.youtube.*/*watch*
// @include        https://*.youtube.*/*watch*
// @exclude        https://www.youtube.com/subscribe_embed*
// @grant          GM_xmlhttpRequest
// @connect        youtube.com
// @connect        localhost
// @connect        192.168.*.*
// @require        file:///Users/tbisegna/git/youtube2mp3/public/youtubemp3.user.js
//// @require      file:///C:/Users/biseg/git/youtube2mp3/public/youtubemp3.user.js
//// @require      file:///D:/homeRaspberry/git/youtube2mp3/public/youtubemp3.user.js
// ==/UserScript==

var youtube2mp3Server = 'http://localhost:7788';
//var youtube2mp3Server = 'http://192.168.1.10:7788';

function HttpCallFunctionJSON(url, callback, getRawResult) {
    try {
        GM_xmlhttpRequest({
            method: 'GET',
            url: url,
            onload: function (responseDetails) {
                if (responseDetails.status == 200) {
                    var result = responseDetails.responseText;
                    if (!getRawResult) result = JSON.parse(result);
                    callback(result);
                } else {
                    console.error(responseDetails)
                }
            },
            onerror:function (error) {
                console.error(error)
            }
        });
    } catch(e) {
        $.getJSON(url, function(data) {
            callback(data)
        });
    }
};

function storePendingTasks() {
    var allTasks = []
    for (var id in downloads) {
        if (downloads.hasOwnProperty(id)) {
            allTasks.push(downloads[id])
        }
    }

    localStorage.setItem('pendingTasks', JSON.stringify(allTasks));
}

var downloads = [];
var monitoringTasks;
var downloadWidth = 450;

var setDownloadDiv = setInterval(function() {
    var container = document.getElementById('container');
    var downloadCorner = document.getElementById('downloadCorner');
    if (container && !downloadCorner) {
        var div = document.createElement('div');
        div.id = 'downloadCorner'
        div.style.position = 'fixed'
        div.style.top = '25px'
        div.style.right = (downloadWidth+20)+'px'
        div.style.height = '0px'
        div.style.width = '0px'
        div.style.zIndex = '9999'
        container.appendChild(div)
    }
}, 500);

function updateProgress(task) {
    try {
        if (downloads[task.id].cancelRequested) {
            delete downloads[task.id]
            storePendingTasks();
            return false;
        }
        downloads[task.id] = task;
        storePendingTasks();

        var downloadCorner = document.getElementById('downloadCorner');
        if (!downloadCorner) {
            console.error('downloadCorner not set!')
            return true;
        }

        var isDone = false;
        var isKO = false;
        if (task.status == 'completed') {
            task.status = 'Terminé'
            task.progressText = ''
            task.progressPercent = 1
            isDone = true;
        } else {
            // Fancy progress
            if (task.progress == -1) {
                task.progressText = ''
                task.progressPercent = 0
            } else {
                if (task.endProgress == -1) {
                    task.progressPercent = 0
                    task.progressText = parseInt(task.progress)/100 + ' Mo'
                } else {
                    task.progressPercent = task.progress/task.endProgress
                    task.progressText = Math.floor(task.progressPercent*1000)/10 + ' %'
                }
            }
            // Fancy status
            if (task.status == 'downloading') task.status = 'Téléchargement et conversion ...' 
            if (task.status == 'converting') task.status = 'Conversion ...'
            if (task.status == 'starting') task.status = 'Démarrage ...'
            if (task.status == 'deleted') task.status = 'Fichier supprimé, veuillez demander à nouveau la conversion.'
            if (task.status == 'error' || task.status == 'ko') {
                isKO = true;
                task.status = 'Une erreur est survenue. <span title="'+task.message.replace(/"/g, '\'')+'">(?)</span>'
            }
            if (!task.filename) task.filename = 'Recupération des infos Youtube ...'
            console.log('Progress for task '+ task.id + ' : '+task.status+'... '+task.progressText)
        }
        
        if (!document.getElementById('downloadTask-'+task.id)) {
            if (downloadCorner) {
                var icon = youtube2mp3Server+'/static/ic_music_note_black_24dp.png';
                if (task.type == 'video') icon = youtube2mp3Server+'/static/ic_ondemand_video_black_24dp.png';
                downloadCorner.innerHTML +=   '<div class="iv-card-content" id="downloadTask-'+task.id+'" style="width:'+(downloadWidth-56-34)+'px;height:30px;margin-bottom:10px;background:white;padding-left:56px;padding-right:34px;box-shadow:1px 1px 5px 1px rgba(0, 0, 0, 0.4);padding-top: 10px;padding-bottom: 15px;">'
                                            + '    <div style="height:0px;"><div id="downloadTask-progressbar-'+task.id+'" style="width:50px;height:5px;background:lightgreen;position:relative;top:40px;left:-56px"></div></div>'
                                            + '    <div style="height:0px;"><img id="downloadTask-icon-'+task.id+'" src="'+icon+'" style="position:relative;left:-45px;top:-3px;height:35px;width:auto"></div>'
                                            + '    <div style="height:0px;"><img id="downloadTask-close-'+task.id+'" src="'+youtube2mp3Server+'/static/baseline_close_black_24dp.png" title="Delete task" style="cursor:pointer;position:relative;left:'+(downloadWidth-56-34+3)+'px;top:-3px;height:24px;width:auto"></div>'
                                            + '    <h2 class="iv-card-primary-link" dir="ltr" style="margin:0;text-overflow: ellipsis;white-space: nowrap;overflow: hidden;cursor:default" id="downloadTask-filename-'+task.id+'" title="'+task.filename.replace(/"/g, '\'')+'">'+task.filename+'</h2>'
                                            + '    <ul class="iv-card-meta-info" style="margin: 2px;cursor:default"><li dir="ltr">'
                                            + '        <b id="downloadTask-status-'+task.id+'">'+task.status+'</b> '
                                            + '        <i id="downloadTask-progress-'+task.id+'">'+task.progressText+'</i>'
                                            + '    </li></ul>'
                                            + '</div>'
                document.getElementById('downloadTask-close-'+task.id).onclick = function() {
                    console.log('Closing Task ' + task.id + '...')
                    document.getElementById('downloadTask-'+task.id).style.display = 'none'
                    if (downloads[task.id]) downloads[task.id].cancelRequested = true;
                }
            }
        } 

        // Update fileds
        document.getElementById('downloadTask-filename-'+task.id).innerHTML = task.filename;
        document.getElementById('downloadTask-status-'+task.id).innerHTML = task.status;
        document.getElementById('downloadTask-progress-'+task.id).innerHTML = task.progressText;
        document.getElementById('downloadTask-progressbar-'+task.id).style.width = Math.floor(task.progressPercent*downloadWidth) + 'px';
        if (isDone) {
            document.getElementById('downloadTask-icon-'+task.id).src = youtube2mp3Server+'/static/ic_done_black_24dp.png';
            document.getElementById('downloadTask-'+task.id).style.display = 'none'
	    delete downloads[task.id]
            storePendingTasks();
        }
        if (isKO) {
            delete downloads[task.id]
            storePendingTasks();
            console.log('Deleted task in error', downloads)
        }
    } catch(e) {
        console.error("Error in updateProgress", e)
    }
    return true;
}

function registerNewOngoingTask(task) {
    var taskid = task.id;
    if (downloads[taskid]) {
        console.log('Task already registered')
        return;
    }
    console.log('Registering new task: '+taskid);
    updateProgress(task);
    downloads[taskid] = task;
    storePendingTasks();
    var monitorTask = setInterval(function() {
        HttpCallFunctionJSON(youtube2mp3Server+'/status/'+taskid,
            function (result) {
                if (result.id) {
                    if (result.status == 'completed') {
                        console.log('Task '+taskid+' complete, downloading '+result.filename);
                        clearInterval(monitorTask);
                        location.href = youtube2mp3Server+'/download/'+taskid // Download
                    }
                    if (result.id !== result.originalId && downloads.indexOf(result.originalId) !== -1) {
                        console.log('Same task is already ongoing ('+result.originalId+'), cancelling '+result.id);
                        document.getElementById('downloadTask-'+task.id).style.display = 'none'
                        clearInterval(monitorTask);
                    }
                    if (result.status == 'ko') {
                        console.log('Task '+taskid+' in error');
                        clearInterval(monitorTask);
                    }
                    if (!updateProgress(result)) {
                        clearInterval(monitorTask);
                    }
                }
            }
        );
    },1000);
    monitorTask
}

function downloadNewVideo(videoID, format) {
    console.log('Requesting download of video '+videoID);
    var service = format == 'MP3' ? 'convertToMp3' : 'downloadMp4'
    HttpCallFunctionJSON(youtube2mp3Server+'/'+service+'/'+videoID,
        function (result) {
            if (result.id) {
                registerNewOngoingTask(result)
            }
        }
    );
}

function downloadPlaylist(playlistID, format) {
    console.log('Requesting video list for playlist '+playlistID);
    HttpCallFunctionJSON(youtube2mp3Server+'/extractPlaylist/'+playlistID,
        function (result) {
            console.log(result)
            console.log("Starting download of "+result.videos.length + " videos...")
            result.videos.forEach(function(id) {downloadNewVideo(id, format)});
        }
    );
}

function addDownloadButton(type) {
    try {
        var div = document.createElement('div');
        div.id = 'download-button';
        div.className = 'style-scope ytd-video-secondary-info-renderer';
        div.innerHTML = '<div style="cursor:pointer;border:1psx solid white;margin-left:5px;padding:20px;position:relative;left:10px;top:-8px;color:#F0F0F0">'
                            + '<div style="height:0px;"><img src="'+youtube2mp3Server+'/static/ic_file_download_white_24dp.png" style="position:relative;left:-12px;top:-3px;height:25px;width:auto"></div>'
                            + ' <span style="position:relative;left:17px;font-size:14px">'+type+'</span>'
                        +'</div>';
        div.title = type == "Playlist" ? 'Telecharger la Playlist au format MP3' : 'Télécharger cette video youtube au format '+type
        div.style.position = 'relative';
        div.style.top = '7px';
        div.addEventListener('click', function () {
            if (type == "Playlist") {
                var playlistID = location.search.split('list=')[1].split('&')[0];
                downloadPlaylist(playlistID, 'MP3');
            } else {
                var videoID = location.search.split('v=')[1].split('&')[0];
                downloadNewVideo(videoID, type);
            }
            return false;
        }, false);
        let aLogo = document.getElementById('logo');
        aLogo.style.width = 'auto'
        aLogo.parentNode.appendChild(div);
        document.getElementById('country-code').style.display = 'none';
        return true
    } catch (e) {
        console.error(e)
    }
    return false
}

// Add button to UI
if (document.URL.indexOf(".youtube.") !== -1) {
    var addButtonsInterval = setInterval(function() {
        if (!document.getElementById('download-button') && document.getElementById('logo')) {
            addDownloadButton('MP3');
            addDownloadButton('MP4');
            //addDownloadButton('Playlist');
            clearInterval(addButtonsInterval);
        }
    }, 100);
}

try {
    var data = localStorage.getItem('pendingTasks');
    if (data) {
        var oldTasks = JSON.parse(data);
        console.log("Retrived "+ oldTasks.length + " pending tasks");
        for (var i=0 ; i<oldTasks.length ; ++i) {
            registerNewOngoingTask(oldTasks[i]);
        }
    }
} catch (e) {
    console.log('Failed to restore task', e)
}
