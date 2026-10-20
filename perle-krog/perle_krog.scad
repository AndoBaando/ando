// ============================================================
//  Perle-krog v3 (S-krog med klik-laas) til stativstang  -  parametrisk OpenSCAD-model
//  Stang:    Ø 22,2 mm (maalt med skydelaere)
//  Printer:  Prusa MK4S
//
//  v3: krogene maa IKKE hoppe af naar stativet koeres over et bump.
//   - Hver ende er en ring der griber om stangen. Ringens spids gaar saa
//     taet paa den anden ring, at aabningen er SMALLERE end stangen
//     -> krogen klikkes paa og sidder fast. Et bump (lodret ryk) kan ikke
//     faa den af: bunden af ringen er lukket, og aabningen vender til siden.
//   - Begge ender er ens (punkt-symmetrisk S) -> samme store aabning i begge
//     ender, og det er ligegyldigt hvilken vej krogen haenges op.
//   - Ringenes centre ligger lodret over hinanden -> krogen haenger lige.
//
//  Printes FLADT paa pladen (som den ligger i previewet):
//   - ingen support
//   - laglinjerne foelger krogens form -> belastningen og klik-fjedringen gaar
//     langs perimetrene (det staerkeste og sejeste en print kan)
//
//  To varianter med PRAECIS samme form (vaelg 'variant' herunder).
//  Eneste forskel er teksten paa ringen, saa man kan kende materialet:
//   PLA  - "PLA",  haeng max ca. 4 kg
//   PETG - "PETG", haeng max ca. 4 kg (kryber mindre end PLA)
//
//  Maal i mm.  F5 = preview, F6 = render, F7 = eksporter STL.
//  KOORDINATER: X/Y = krogens plan (pladen), Z = tykkelse (printhoejde)
// ============================================================

/* [Variant] */
variant       = "PETG"; // [PETG:PETG-krog, PLA:PLA-krog]

/* [Stang og klik-laas] */
rod_d         = 22.2;  // maalt stang-diameter
ring_d        = 27;    // indv. Ø i begge ringe (luft om stangen, plads til bundter)
snap_gap      = 20.5;  // aabningen ind i ringen. Mindre end rod_d = klik-laas (22,2 - 20,5 = 1,7 mm)

/* [Profil - styrke vs. materiale] */
wall          = 8;     // godsbredde i krogens plan (baerer boejningen, styrke ~ bredde^2)
thick         = 7;     // tykkelse = printhoejde (krogens bredde langs stangen)
edge_chamfer  = 0.6;   // fas paa over-/underkant (skaaner snore + modvirker elefantfod)

/* [Maerkning] */
label         = variant;  // tekst praeget ned i top-ringen: "PLA" eller "PETG" ("" = ingen)
label_size    = 4.5;   // skriftstoerrelse
label_pitch   = 4.1;   // afstand mellem bogstaverne langs buen (mm)
label_angle   = 180;   // placering paa top-ringen (180 = venstre side, der er lukket)
label_depth   = 0.6;   // dybde (3 lag a 0,2 mm)
label_font    = "Liberation Sans:style=Bold";

/* [Kvalitet] */
$fn = 120;

// ---------- afledte maal ----------
R    = ring_d / 2;                    // indv. radius
rc   = R + wall/2;                    // centerlinje-radius
D    = 2 * rc;                        // afstand mellem ringenes centre (glat S, ringene moedes i midten)
T    = [0, 0];                        // centrum top-ring (stangen)
B    = [0, -D];                       // centrum bund-ring (bundter)
// Top-ringen gaar fra spidsen (vinkel a0) mod uret over toppen og ned til midten (270 grader).
// Spidsens placering vaelges saa afstanden fra spidsen til bund-ringens yderside = snap_gap:
//   |spids - B| = rc*sqrt(5 + 4 sin(a0))   ->   gap = |spids - B| - (R + wall) - wall/2
a0   = asin((pow((snap_gap + R + wall + wall/2) / rc, 2) - 5) / 4);
a1   = 270;

echo(str("Ring: indv. Ø ", ring_d, " mm, aabning ", snap_gap, " mm -> klik-laas ", rod_d - snap_gap, " mm"));
echo(str("Spidsen sidder ved ", a0, " grader, ringen daekker ", a1 - a0, " grader"));
echo(str("Krogens hoejde ", D + 2*(R + wall), " mm, bredde ", 2*(R + wall), " mm"));

// ---------- 2D-byggeklodser ----------
function pol(r, a) = r * [cos(a), sin(a)];

module ring2d(c, rot) {                   // ring fra den afrundede spids til midten af S'et
    n = 120;
    e = 0.5;                              // lille overlap med den anden ring i midten
    translate(c) rotate(rot) {
        polygon(concat(
            [for (i = [0:n])  pol(rc + wall/2, a0 + (a1 + e - a0) * i/n)],
            [for (i = [n:-1:0]) pol(rc - wall/2, a0 + (a1 + e - a0) * i/n)]));
        translate(pol(rc, a0)) circle(d = wall);
    }
}

module profile2d() {
    union() {
        ring2d(T, 0);                     // top-ring (om stangen)
        ring2d(B, 180);                   // bund-ring (samme ring drejet 180 grader)
    }
}

// ---------- 3D: ekstruderet profil med trappe-fas (1 trin pr. ~0,2 mm lag) ----------
module hook3d() {
    difference() {
        hook_body();
        // tekst langs top-ringens lukkede side (ved neutralaksen -> svaekker ikke krogen)
        if (label != "") {
            n = len(label);
            step = label_pitch / rc * 180 / PI;
            for (i = [0:n-1]) {
                a = label_angle - (n - 1) / 2 * step + i * step;
                translate([0, 0, thick - label_depth])
                    translate(pol(rc, a)) rotate(a + 90)
                        linear_extrude(label_depth + 0.01)
                            text(label[i], size = label_size, font = label_font,
                                 halign = "center", valign = "center");
            }
        }
    }
}

module hook_body() {
    c = edge_chamfer;
    steps = max(1, round(c / 0.2));
    if (c > 0) for (k = [0:steps-1]) {
        inset = c * (steps - k) / steps;
        translate([0, 0, c*k/steps])
            linear_extrude(c/steps + 0.001) offset(delta = -inset) profile2d();
        translate([0, 0, thick - c*(k+1)/steps - 0.001])
            linear_extrude(c/steps + 0.001) offset(delta = -inset) profile2d();
    }
    translate([0, 0, c]) linear_extrude(thick - 2*c) profile2d();
}

hook3d();
