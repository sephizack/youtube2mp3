// ==UserScript==
// @name           Youtube-MP3 button
// @description    Button to download mp3s directly from youtube when possible, using the youtube-mp3.org service.
// @include        https://*.youtube.*
// @include        http://*.youtube.*/*watch*
// @include        https://*.youtube.*/*watch*
// @exclude        https://www.youtube.com/subscribe_embed*
// @grant          GM_xmlhttpRequest
// @connect        localhost
//// @require      file:///C:/Users/biseg/git/youtube2mp3/youtubemp3.user.js
// ==/UserScript==

var downloads = [];
var youtube2mp3Server = 'http://localhost:7788';
var downloadWidth = 400;

var setDownloadDiv = setInterval(function() {
    var container = document.querySelector("#meta-contents").querySelector("#container");
    var downloadCorner = document.getElementById('downloadCorner');
    if (container && !downloadCorner) {
        var div = document.createElement('div');
        div.id = 'downloadCorner'
        div.style.position = 'fixed'
        div.style.top = '25px'
        div.style.right = (downloadWidth+25)+'px'
        div.style.height = '0px'
        div.style.width = '0px'
        div.style.zIndex = '9999'
        container.appendChild(div)
    }
}, 500);

function updateProgress(task) {
    try {
        var downloadCorner = document.getElementById('downloadCorner');
        if (!downloadCorner) {
            console.error('downloadCorner not set!')
            return
        }

        var isDone = false;
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
            if (task.status == 'downloading') task.status = 'Téléchargement ...' 
            if (task.status == 'converting') task.status = 'Conversion ...'
            if (task.status == 'starting') task.status = 'Démarrage ...'
            if (!task.filename) task.filename = 'Recupération des infos Youtube ...'
            console.log('Progress for task '+ task.id + ' : '+task.status+'... '+task.progressText)
        }
        
        if (!document.getElementById('downloadTask-'+task.id)) {
            if (downloadCorner) {
                var icon = youtube2mp3Server+'/static/ic_music_note_black_24dp.png';
                if (task.type == 'video') icon = youtube2mp3Server+'/static/ic_ondemand_video_black_24dp.png';
                downloadCorner.innerHTML +=   '<div class="iv-card-content" id="downloadTask-'+task.id+'" style="width:'+(downloadWidth-56-10)+'px;height:30px;margin-bottom:10px;background:white;padding-left:56px;padding-right:10px;box-shadow:1px 1px 5px 1px rgba(0, 0, 0, 0.4);padding-top: 15px;padding-bottom: 15px;">'
                                            + '    <div style="height:0px;"><div id="downloadTask-progressbar-'+task.id+'" style="width:50px;height:5px;background:lightgreen;position:relative;top:40px;left:-56px"></div></div>'
                                            + '    <div style="height:0px;"><img id="downloadTask-icon-'+task.id+'" src="'+icon+'" style="position:relative;left:-45px;top:-3px;height:35px;width:auto"></div>'
                                            + '    <h2 class="iv-card-primary-link" dir="ltr" style="text-overflow: ellipsis;white-space: nowrap;overflow: hidden;" id="downloadTask-filename-'+task.id+'">'+task.filename+'</h2>'
                                            + '    <ul class="iv-card-meta-info"><li dir="ltr">'
                                            + '        <b id="downloadTask-status-'+task.id+'">'+task.status+'</b> '
                                            + '        <i id="downloadTask-progress-'+task.id+'">'+task.progressText+'</i>'
                                            + '    </li></ul>'
                                            + '</div>'
            }
        } 

        // Update fileds
        document.getElementById('downloadTask-filename-'+task.id).innerHTML = task.filename;
        document.getElementById('downloadTask-status-'+task.id).innerHTML = task.status;
        document.getElementById('downloadTask-progress-'+task.id).innerHTML = task.progressText;
        document.getElementById('downloadTask-progressbar-'+task.id).style.width = Math.floor(task.progressPercent*downloadWidth) + 'px';
        if (isDone) {
            document.getElementById('downloadTask-icon-'+task.id).src = youtube2mp3Server+'/static/ic_done_black_24dp.png';
            downloads.pop(task.id)
            setTimeout(function() {
                // TODO fadeOut
                document.getElementById('downloadTask-'+task.id).style.display = 'none'
            }, 4000);
        }
    } catch(e) {
        console.error("Error in updateProgress", e)
    }
}

function registerNewOngoingTask(task) {
    var taskid = task.id;
    if (downloads.indexOf(taskid) !== -1) {
        console.log('Task already registered')
        return;
    }
    console.log('Registering new task: '+taskid);
    updateProgress(task);
    downloads.push(taskid)
    var monitorTask = setInterval(function() {
        GM_xmlhttpRequest({
            method: 'GET',
            url: youtube2mp3Server+'/status/'+taskid,
            onload: function (responseDetails) {
                if (responseDetails.status == 200) {
                    var result = JSON.parse(responseDetails.responseText);
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
                        updateProgress(result);
                    }
                } else {
                    console.error(responseDetails)
                }
            },
            onerror:function (error) {
                console.error(error)
            }
        });
    },1000);
}

function downloadNewVideo(id, format) {
    console.log('Requesting download of video '+id);
    var service = format == 'MP3' ? 'convertToMp3' : 'downloadMp4'
    console.log("format", format);
    GM_xmlhttpRequest({
        method: 'GET',
        url: youtube2mp3Server+'/'+service+'/'+id,
        onload: function (responseDetails) {
            if (responseDetails.status == 200) {
                var result = JSON.parse(responseDetails.responseText);
                if (result.id) {
                    registerNewOngoingTask(result)
                }
            } else {
                console.error(responseDetails)
            }
        },
        onerror:function (error) {
            console.error(error)
        }
    });
}

function addDownloadButton(subButton, type) {
    if(subButton && subButton.innerHTML.indexOf(type) == -1) {
        var buttonName = type == "MP3" ? "MP3" : "Clip"
        var div = document.createElement('div');
        div.id = 'download-button';
        div.className = 'style-scope ytd-video-secondary-info-renderer style-destructive';
        div.innerHTML = subButton.outerHTML.replace('aria-disabled="false"', 'aria-disabled="true" style="color: var(--yt-subscribe-button-text-color);background-color: var(--yt-brand-paper-button-color); padding:12px; padding-right:25px; margin-left:10px; border-radius:1px;"');
        div.title = 'Télécharger cette video youtube au format '+type
        div.getElementsByTagName('yt-formatted-string')[0].innerHTML = '<div style="height:0px;"><img src="'+youtube2mp3Server+'/static/ic_file_download_white_24dp.png" style="position:relative;left:-12px;top:-3px;height:25px;width:auto"></div> <span style="position:relative;left:17px;">'+buttonName+'</span>';
        div.style.position = 'relative';
        div.style.top = '7px';

        div.addEventListener('click', function () {
            var videoID = location.search.split('v=')[1].split('&')[0];
            downloadNewVideo(videoID, type);
        }, false);
        console.log("buttons", div);
        document.getElementById('top-row').appendChild(div);
        return true
    }
    return false
}

// Add button to UI
if (document.URL.indexOf(".youtube.") !== -1) {
    var addButtonsInterval = setInterval(function() {
        if (!document.getElementById('download-button')) {
            var paperButtons = document.getElementsByTagName('paper-button');
            var subButton = null;
            for (var i=0 ; i<paperButtons.length ; ++i) {
                if (paperButtons[i].className.indexOf('ytd-button-renderer') !== -1) {
                    subButton = paperButtons[i];
                    break
                }
            }
            if (addDownloadButton(subButton, 'MP3') && addDownloadButton(subButton, 'MP4')) {
                clearInterval(addButtonsInterval);
            }
        }
    }, 100);
}
