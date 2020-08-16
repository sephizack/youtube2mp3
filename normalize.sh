#! /bin/bash

exit_on_error() {
    printf "$1\n"
    exit 1
}
ffmpeg-normalize -h > /dev/null 2>&1 || exit_on_error "\033[31m ffmpeg-normalize not found\033[0m"
ffmpeg-normalize "$1"/*.mp3 -of "$1/normalized" -c:a mp3 -ext mp3 -pr -t -15 -b:a 320k -f