/* Stream four independent TinySoundFont stems; copies share read-only sample memory. */
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#define TSF_IMPLEMENTATION
#include "tsf.h"

enum { BLOCK = 8192, VOICES = 48, STEMS = 4, MAX_EVENTS = 10000 };
typedef struct { long frame; int on, ch, key, vel; } Event;
static Event events[STEMS][MAX_EVENTS];
static float pcm[2 * BLOCK];

int main(int argc, char **argv) {
    const int channels[] = {1, 2, 3, 9};
    const int programs[] = {32, 12, 8, 40};
    int count[STEMS] = {0}, next[STEMS] = {0};
    tsf *s[STEMS];
    if (argc != 4) return 1;
    long frames = atol(argv[3]);
    if (frames <= 0 || frames > 44100L * 600) return 2;
    FILE *file = fopen(argv[2], "r");
    if (!file) return 3;
    Event e;
    int parsed;
    while ((parsed = fscanf(file, "%ld %d %d %d %d", &e.frame, &e.on, &e.ch, &e.key, &e.vel)) == 5) {
        int i = 0;
        while (i < STEMS && channels[i] != e.ch) ++i;
        if (i == STEMS || count[i] == MAX_EVENTS || e.frame < 0 || e.frame >= frames
                || (count[i] && e.frame < events[i][count[i] - 1].frame)
                || e.on < 0 || e.on > 1 || e.key < 0 || e.key > 127 || e.vel < 0 || e.vel > 127) return 4;
        events[i][count[i]++] = e;
    }
    if (parsed != EOF || ferror(file)) return 4;
    fclose(file);
    s[0] = tsf_load_filename(argv[1]);
    if (!s[0]) return 5;
    for (int i = 0; i < STEMS; ++i) {
        if (i) s[i] = tsf_copy(s[0]);
        if (!s[i]) return 6;
        tsf_set_output(s[i], TSF_STEREO_INTERLEAVED, 44100, -9);
        if (!tsf_set_max_voices(s[i], VOICES)
                || !tsf_channel_set_bank_preset(s[i], channels[i], i == 3 ? 128 : 0, programs[i])) return 7;
    }
    for (long offset = 0; offset < frames; offset += BLOCK) {
        int size = frames - offset < BLOCK ? (int)(frames - offset) : BLOCK;
        for (int i = 0; i < STEMS; ++i) {
            long cursor = offset, end = offset + size;
            while (cursor < end) {
                while (next[i] < count[i] && events[i][next[i]].frame <= cursor) {
                    e = events[i][next[i]++];
                    if (e.on) tsf_channel_note_on(s[i], e.ch, e.key, e.vel / 127.f);
                    else tsf_channel_note_off(s[i], e.ch, e.key);
                }
                long until = next[i] < count[i] ? events[i][next[i]].frame : end;
                if (until > end) until = end;
                int n = (int)(until - cursor);
                tsf_render_float(s[i], pcm + 2 * (cursor - offset), n, 0);
                cursor = until;
            }
            if (fwrite(pcm, sizeof(float), 2 * size, stdout) != (size_t)(2 * size)) return 8;
        }
    }
    for (int i = STEMS - 1; i >= 0; --i) tsf_close(s[i]);
    return fflush(stdout) == 0 ? 0 : 9;
}
