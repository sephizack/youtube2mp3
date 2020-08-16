#! /bin/bash

for file in "$@" ; do
    name=`basename "$file"`
    videoId=`./extractYoutubeIdFromTitle.py "$name"`
    echo "Filename = $file"
    echo "Video ID = $videoId"
    #exit 1
    echo "Dowloading icon..."
    curl "https://img.youtube.com/vi/$videoId/0.jpg" 2>/dev/null > icon.jpg \
        && ffmpeg -y -i "$file" -i "icon.jpg" -map 0:0 -map 1:0 -c copy -id3v2_version 3 -metadata:s:v title="Album cover" -metadata:s:v comment="Cover" "tmp.mp3" \
        && rm "$file" && mv "tmp.mp3" "$file"
done
