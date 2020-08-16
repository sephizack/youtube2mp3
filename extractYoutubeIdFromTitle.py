#!/usr/bin/python3
import sys, urllib.request
import urllib.parse

title = sys.argv[1]
content = urllib.request.urlopen("https://www.youtube.com/results?search_query="+urllib.parse.quote(title)).read()
parts = str(content).split('videoId":"')
if (len(parts) > 1):
    print(parts[1].split('"')[0])
else:
    sys.exit(1)