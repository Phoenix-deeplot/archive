"""A fake podcast on 127.0.0.1:8843 for trying the player: an RSS feed (itunes tags) with four episodes whose sound is a short WAV tone served WITH byte ranges (seeking needs them), the episodes' own
pages (so there is something to read while it plays), and one episode whose sound is gone (404). GET /__log shows what was asked of the sound files (who asked: the browser, not the service).
usage: python podcast_site.py 8843"""
import io
import json
import math
import struct
import sys
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8843
BASE = 'http://127.0.0.1:%d' % PORT
RATE = 8000
LOG = []


def tone(freq, seconds):
    buf = io.BytesIO()
    with wave.open(buf, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(b''.join(struct.pack('<h', int(9000 * math.sin(2 * math.pi * freq * n / RATE))) for n in range(int(RATE * seconds))))
    return buf.getvalue()


SOUND = {'/ep1.wav': tone(440, 12), '/ep2.wav': tone(523, 8), '/ep3.wav': tone(659, 6)}
EPISODES = [(3, 'Ep 3 Phrasal verbs for a day at work', 'Wed, 21 Oct 2026 08:00:00 GMT', '/ep3.wav', 6), (2, 'Ep 2 Small talk that is not small', 'Tue, 20 Oct 2026 08:00:00 GMT', '/ep2.wav', 8),
            (1, 'Ep 1 How to order coffee in English', 'Mon, 19 Oct 2026 08:00:00 GMT', '/ep1.wav', 12), (0, 'Ep 0 The one whose sound is gone', 'Sun, 18 Oct 2026 08:00:00 GMT', '/gone.mp3', 5)]
NOTES = ('Show notes. ' + 'In this episode we practise the phrases people really use at work, one situation after another, slowly and then at normal speed. ' * 8)


def rss():
    items = ''.join('<item><title>%s</title><link>%s/notes/ep%d</link><guid isPermaLink="false">ep-%d</guid><pubDate>%s</pubDate><description>%s</description>'
                    '<enclosure url="%s%s" length="%d" type="audio/%s"/><itunes:duration>%d</itunes:duration></item>' % (t, BASE, n, n, d, 'Episode %d: ' % n + NOTES[:120], BASE, p, len(SOUND.get(p, b'')), 'wav' if p.endswith('wav') else 'mpeg', s)
                    for n, t, d, p, s in EPISODES)
    return ('<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"><channel><title>English Learning Show</title><link>%s/</link>'
            '<description>A made-up podcast for trying the player.</description><language>en</language>%s</channel></rss>' % (BASE, items))


class H(BaseHTTPRequestHandler):
    def send(self, status, body=b'', ctype='text/html; charset=utf-8', extra=None):
        body = body.encode('utf-8') if isinstance(body, str) else body
        self.send_response(status)
        self.send_header('Content-Type', ctype)
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        p = self.path.split('?')[0]
        if p == '/__log':
            return self.send(200, json.dumps(LOG), 'application/json')
        if p == '/__reset':
            LOG.clear()
            return self.send(200, '{}', 'application/json')
        if p == '/feed.xml':
            return self.send(200, rss(), 'application/rss+xml; charset=utf-8')
        if p in SOUND:
            data, rng = SOUND[p], self.headers.get('Range')
            LOG.append({'path': p, 'range': rng, 'ua': (self.headers.get('User-Agent') or '')[:40], 'referer': self.headers.get('Referer') or ''})
            if rng and rng.startswith('bytes='):
                a, _, b = rng[6:].partition('-')
                start = int(a or 0)
                end = min(int(b) if b else len(data) - 1, len(data) - 1)
                return self.send(206, data[start:end + 1], 'audio/wav', {'Accept-Ranges': 'bytes', 'Content-Range': 'bytes %d-%d/%d' % (start, end, len(data))})
            return self.send(200, data, 'audio/wav', {'Accept-Ranges': 'bytes'})
        if p.startswith('/notes/ep'):
            n = p[len('/notes/ep'):]
            t = next((x[1] for x in EPISODES if str(x[0]) == n), 'Episode')
            return self.send(200, '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>%s</title></head><body><article><h1>%s</h1><p>%s</p><p>%s</p></article></body></html>' % (t, t, NOTES, NOTES))
        if p == '/robots.txt':
            return self.send(404)
        self.send(404)

    def log_message(self, *a):
        pass


ThreadingHTTPServer(('127.0.0.1', PORT), H).serve_forever()
