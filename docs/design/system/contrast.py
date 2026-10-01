def lum(h):
    h=h.lstrip('#'); r,g,b=[int(h[i:i+2],16)/255 for i in (0,2,4)]
    f=lambda c: c/12.92 if c<=0.03928 else ((c+0.055)/1.055)**2.4
    return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b)
def cr(a,b):
    la,lb=lum(a),lum(b); hi,lo=max(la,lb),min(la,lb); return (hi+0.05)/(lo+0.05)
def mix(fg,bg,a):
    f=[int(fg.lstrip('#')[i:i+2],16) for i in (0,2,4)]; b=[int(bg.lstrip('#')[i:i+2],16) for i in (0,2,4)]
    return '#%02x%02x%02x'%tuple(round(b[i]+(f[i]-b[i])*a) for i in range(3))
pairs = [
 # LIGHT
 ('L text-1 on panel', '#1c1a17', '#ffffff'),
 ('L text-1 on canvas', '#1c1a17', '#f8f7f4'),
 ('L text-2 on panel', '#5c574e', '#ffffff'),
 ('L text-2 on canvas', '#5c574e', '#f8f7f4'),
 ('L text-3 on panel', '#7a756a', '#ffffff'),
 ('L text-3 on surface-2', '#7a756a', '#f1efea'),
 ('L text-3 on canvas', '#7a756a', '#f8f7f4'),
 ('L placeholder 400 on panel', '#a39e92', '#ffffff'),
 ('L white on accent-600', '#ffffff', '#6b25e6'),
 ('L white on accent-700 hover', '#ffffff', '#5a1bc2'),
 ('L accent-700 text on panel', '#5a1bc2', '#ffffff'),
 ('L accent-700 text on accent-50', '#5a1bc2', '#f4f0ff'),
 ('L needs_review ink on soft', '#7a4a08', '#fbeed7'),
 ('L failed ink on soft', '#7f1c20', '#fbe1e2'),
 ('L delivered ink on soft', '#1f5a2b', '#e1f3e4'),
 ('L generating ink on soft', '#125868', '#dcf1f6'),
 ('L review ink on soft', '#4b1a9e', '#ece3ff'),
 ('L intake ink on soft', '#4a463f', '#ece9e2'),
 ('L waiting ink on soft', '#7f3410', '#fce7dc'),
 ('L bad text #b42a31 on panel', '#b42a31', '#ffffff'),
 ('L ok text #2f7a3d on panel', '#2f7a3d', '#ffffff'),
 ('L warn text #9a5d0c on panel', '#9a5d0c', '#ffffff'),
 # DARK
 ('D text-1 on panel', '#f1efea', '#1c1a17'),
 ('D text-1 on canvas', '#f1efea', '#121110'),
 ('D text-2 #a39e92 on panel', '#a39e92', '#1c1a17'),
 ('D text-2 #a39e92 on surface-2', '#a39e92', '#242220'),
 ('D text-3 #7a756a on panel', '#7a756a', '#1c1a17'),
 ('D text-3 #8a857a on panel', '#8a857a', '#1c1a17'),
 ('D text-3 #8a857a on surface-2', '#8a857a', '#242220'),
 ('D white on accent-500', '#ffffff', '#7d3cf8'),
 ('D white on accent-400 hover', '#ffffff', '#9865ff'),
 ('D accent-300 text on panel', '#b799ff', '#1c1a17'),
 ('D needs_review light on dim', '#f2c57c', '#3a2c18'),
 ('D failed light on dim', '#f0999d', '#391f1d'),
 ('D delivered light on dim', '#9fd6aa', '#212e20'),
 ('D generating light on dim', '#93d3e0', '#1c2d2e'),
 ('D review light on dim', '#c9b1ff', '#2c1f3b'),
 ('D intake light on dim', '#cfcac0', '#2e2b27'),
 ('D waiting light on dim', '#f3ae8c', '#3b261a'),
 ('D approved light on dim', '#a9bff5', '#212837'),
 ('D editing light on dim', '#94d6cc', '#1e2f2a'),
 ('D finishing light on dim', '#b3b3f0', '#262436'),
 ('D bad text #f0999d on panel', '#f0999d', '#1c1a17'),
 ('D ok text #9fd6aa on panel', '#9fd6aa', '#1c1a17'),
 ('D warn text #f2c57c on panel', '#f2c57c', '#1c1a17'),
 # surfaces vs each other (want >= 1.1 visible steps)
 ('D canvas vs panel', '#121110', '#1c1a17'),
 ('D panel vs surface-2', '#1c1a17', '#242220'),
 ('D surface-2 vs surface-3', '#242220', '#2c2925'),
 ('L canvas vs panel', '#f8f7f4', '#ffffff'),
 ('L panel vs surface-2', '#ffffff', '#f1efea'),
 ('L surface-2 vs surface-3', '#f1efea', '#e9e6df'),
]
for n,a,b in pairs: print(f'{cr(a,b):5.2f}  {n}')
print('--- computed dims (stage DEFAULT mixed 16% over #1c1a17) ---')
for name,c in [('intake','#8a8479'),('review','#7d3cf8'),('approved','#3b6fe0'),('generating','#1f8fa8'),('needs_review','#d98a1f'),('editing','#2a9d8f'),('finishing','#5b5bd6'),('delivered','#3d9a4f'),('waiting','#e0662b'),('failed','#d4383f')]:
    print(name, mix(c,'#1c1a17',0.16))
print('--- hairlines flattened ---')
print('L hairline .08 on white', mix('#1c1a17','#ffffff',0.08), ' .14', mix('#1c1a17','#ffffff',0.14))
print('D hairline .08 on panel', mix('#ffffff','#1c1a17',0.08), ' .14', mix('#ffffff','#1c1a17',0.14))
print('L hover overlay .05 on white', mix('#1c1a17','#ffffff',0.05), ' D hover .06 on panel', mix('#ffffff','#1c1a17',0.06))
