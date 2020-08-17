#! /bin/bash

exit_on_error() {
    printf "$1\n"
    exit 1
}

ffmpeg-normalize -h > /dev/null 2>&1 || exit_on_error "\033[31m ffmpeg-normalize not found\033[0m. https://github.com/slhck/ffmpeg-normalize"
if [ -d "$1" ] ; then
    ffmpeg-normalize "$1"/*.mp3 -of "$1/normalized" -c:a mp3 -ext mp3 -pr -t -15 -b:a 320k -f
else
    for file in "$@" ; do
        basedir=`dirname "$file"`
        ffmpeg-normalize "$file" -of "$basedir/normalized" -c:a mp3 -ext mp3 -pr -t -15 -b:a 320k -f
    done
fi
