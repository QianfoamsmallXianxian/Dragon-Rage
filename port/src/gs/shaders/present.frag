#version 450
layout(location = 0) in vec2 vUv;
layout(location = 0) out vec4 outColor;
layout(set = 2, binding = 0) uniform sampler2D src;
layout(set = 3, binding = 0) uniform Params {
    vec4 tex;
    vec4 region;
    ivec4 mode;
} p;

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

vec3 anime(vec2 uv, vec2 texel) {
    vec3 c0 = texture(src, uv).rgb;
    vec3 n = texture(src, uv + vec2(0.0, -texel.y)).rgb;
    vec3 s = texture(src, uv + vec2(0.0,  texel.y)).rgb;
    vec3 w = texture(src, uv + vec2(-texel.x, 0.0)).rgb;
    vec3 e = texture(src, uv + vec2( texel.x, 0.0)).rgb;

    float l0 = luma(c0);
    float ln = luma(n);
    float ls = luma(s);
    float lw = luma(w);
    float le = luma(e);
    float lmn = min(min(ln, ls), min(min(lw, le), l0));
    float lmx = max(max(ln, ls), max(max(lw, le), l0));
    float local = lmx - lmn;
    float wgt = mix(0.22, 0.55, smoothstep(0.015, 0.22, local));
    float lsharp = l0 + (l0 - (ln + ls + lw + le) * 0.25) * wgt;
    lsharp = clamp(lsharp, lmn, lmx);
    float ld = lsharp - l0;
    vec3 c = clamp(c0 + ld, 0.0, 1.0);

    float l1 = luma(c);
    vec3 chroma = c - vec3(l1);
    float cmax = max(max(chroma.r, chroma.g), chroma.b);
    float cmin = min(min(chroma.r, chroma.g), chroma.b);
    float sat1 = mix(1.18, 1.06, smoothstep(0.05, 0.85, l1));
    if (cmax > 0.001) {
        float room_hi = (1.0 - l1) / cmax;
        float room_lo = l1 / max(-cmin, 0.001);
        sat1 = min(sat1, min(room_hi, room_lo));
    }
    c = clamp(vec3(l1) + chroma * sat1, 0.0, 1.0);

    float l2 = luma(c);
    float darks = 1.0 - smoothstep(0.0, 0.32, l2);
    c = c + vec3(0.018) * darks * (c - vec3(l2));
    c = clamp(c, 0.0, 1.0);

    float l3 = luma(c);
    float ls3 = l3 * l3 * (3.0 - 2.0 * l3);
    float gain = ls3 / max(l3, 0.0015);
    gain = clamp(gain, 0.0, 1.6);
    c = clamp(c * mix(1.0, gain, 0.13), 0.0, 1.0);

    vec2 q = uv / max(p.region.xy, vec2(1e-4)) - 0.5;
    c *= 1.0 - dot(q, q) * 0.075;
    c = clamp(c, 0.0, 1.0);

    float avg = luma(c0)
        + luma(texture(src, p.region.xy * vec2(0.15, 0.15)).rgb)
        + luma(texture(src, p.region.xy * vec2(0.85, 0.15)).rgb)
        + luma(texture(src, p.region.xy * vec2(0.15, 0.85)).rgb)
        + luma(texture(src, p.region.xy * vec2(0.85, 0.85)).rgb);
    avg *= 0.2;
    float k = mix(1.0, 0.45, smoothstep(0.55, 0.88, avg));
    return mix(c0, c, k);
}

vec3 fxaa(vec2 uv) {
    vec2 r = p.tex.xy;
    vec3 cM = texture(src, uv).rgb;
    float lM = luma(cM);
    float lNW = luma(texture(src, uv + vec2(-1.0, -1.0) * r).rgb);
    float lNE = luma(texture(src, uv + vec2(1.0, -1.0) * r).rgb);
    float lSW = luma(texture(src, uv + vec2(-1.0, 1.0) * r).rgb);
    float lSE = luma(texture(src, uv + vec2(1.0, 1.0) * r).rgb);
    float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
    float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
    if (lMax - lMin < max(0.0312, lMax * 0.125)) {
        return cM;
    }
    vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));
    float reduce = max((lNW + lNE + lSW + lSE) * 0.25 * (1.0 / 8.0), 1.0 / 128.0);
    float rcpMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + reduce);
    dir = clamp(dir * rcpMin, vec2(-8.0), vec2(8.0)) * r;
    vec3 a = 0.5 * (texture(src, uv + dir * (1.0 / 3.0 - 0.5)).rgb + texture(src, uv + dir * (2.0 / 3.0 - 0.5)).rgb);
    vec3 b = a * 0.5 + 0.25 * (texture(src, uv - dir * 0.5).rgb + texture(src, uv + dir * 0.5).rgb);
    float lB = luma(b);
    return (lB < lMin || lB > lMax) ? a : b;
}

void main() {
    vec2 uv = vUv * p.region.xy;
    vec3 c;
    if (p.mode.x == 1) {
        vec2 t = uv * p.tex.zw, base = floor(t), d = t - base - 0.5;
        vec2 scale = max(p.region.zw, vec2(1.0)), inner = 0.5 - 0.5 / scale;
        vec2 f = (d - clamp(d, -inner, inner)) * scale + 0.5;
        c = texture(src, (base + f) * p.tex.xy).rgb;
    } else if (p.mode.x == 2) {
        c = fxaa(uv);
    } else if (p.mode.x == 5) {
        c = anime(uv, p.tex.xy);
    } else {
        c = texture(src, uv).rgb;
    }
    outColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
