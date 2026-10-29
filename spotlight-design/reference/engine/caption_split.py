import json, sys
p = sys.argv[1]
caps = json.load(open(p)); out = []
for c in caps:
    t = c["text"]
    if len(t) <= 48:
        out.append(c); continue
    words = t.split(" "); best = None
    for i in range(1, len(words)):
        a = " ".join(words[:i]); d = abs(len(a) - len(t) / 2)
        if words[i - 1][-1] in ",.?:;": d -= len(t) * 0.3
        if best is None or d < best[0]: best = (d, i)
    a, b = " ".join(words[:best[1]]), " ".join(words[best[1]:])
    m = c["a"] + (c["b"] - c["a"]) * len(a) / len(t)
    out += [{"a": c["a"], "b": round(m, 3), "text": a}, {"a": round(m, 3), "b": c["b"], "text": b}]
json.dump(out, open(p, "w"), indent=1)
print(len(caps), "->", len(out))
