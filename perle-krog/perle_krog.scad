// ============================================================
//  Perle-krog (S-krog) til stativstang  -  parametrisk OpenSCAD-model
//  Stang:    Ø 22,2 mm (maalt med skydelaere)
//  Printer:  Prusa MK4S
//  Stil:     S-krog som IKEA's, men med stor top-krog til stangen og en
//            lille, dyb hage forneden til perlebundterne.
//
//  Printes FLADT paa pladen (som den ligger i previewet):
//   - ingen support
//   - laglinjerne foelger krogens form -> belastningen gaar ALONG
//     perimetrene, ikke paa tvaers af lagene (det staerkeste en print kan)
//
//  Smart detalje - "haeldnings-kompensation":
//   En S-krog haenger altid skaevt, fordi stangens centrum og hagens
//   centrum skal ligge lodret under hinanden. Modellen regner selv
//   haeldningen ud og lader hagen bue ekstra rundt, saa hagen staar
//   som en dyb kop naar krogen HAENGER (bundterne glider ikke af).
//
//  To varianter med PRAECIS samme form (vaelg 'variant' herunder).
//  Eneste forskel er teksten i skaftet, saa man kan kende materialet:
//   PLA  - "PLA" praeget i skaftet,  haeng max ca. 4 kg
//   PETG - "PETG" praeget i skaftet, haeng max ca. 4 kg (kryber mindre end PLA)
//
//  Maal i mm.  F5 = preview, F6 = render, F7 = eksporter STL.
//  KOORDINATER: X/Y = krogens plan (pladen), Z = tykkelse (printhoejde)
// ============================================================

/* [Variant] */
variant       = "PETG"; // [PETG:PETG-krog, PLA:PLA-krog]

/* [Stang] */
rod_d         = 22.2;  // maalt stang-diameter
rod_clearance = 1.8;   // luft rundt om stangen -> indv. Ø = 24 mm (let at haenge paa/af)

/* [Profil - styrke vs. materiale] */
// Dimensioneret til ca. 4 kg i PLA (som kryber under konstant last) - PETG faar samme form
wall          = 8;     // godsbredde i krogens plan (den der baerer boejningen, styrke ~ bredde^2)
thick         = 7;     // tykkelse = printhoejde (krogens bredde langs stangen)
edge_chamfer  = 0.6;   // fas paa over-/underkant (skaaner snore + modvirker elefantfod)

/* [Top-krog (om stangen)] */
top_tip       = 6;     // lige spids efter halvcirklen (laengere = sidder sikrere)

/* [Perle-hage (forneden)] */
hook_d        = 15;    // indv. Ø i hagen -> aabning ca. 12-12,5 mm som butikkens metal-kroge
shank         = 27;    // lige stykke mellem de to buer (laengere = mere lodret, mere plast)
hook_tip      = 4;     // lige spids paa hagen
hook_wrap     = -1;    // ekstra bue ud over 180 grader. -1 = automatisk ud fra haeldningen
wrap_margin   = 20;    // (auto) grader under fuld kompensation -> spidsen peger lidt udad = bred aabning

/* [Maerkning] */
label         = variant;  // tekst praeget ned i skaftet: "PLA" eller "PETG" ("" = ingen)
label_size    = 4.5;   // skriftstoerrelse
label_depth   = 0.6;   // dybde (3 lag a 0,2 mm)
label_font    = "Liberation Sans:style=Bold";

/* [Kvalitet] */
$fn = 120;

// ---------- afledte maal ----------
R1   = (rod_d + rod_clearance) / 2;   // indv. radius, top-krog
r1   = R1 + wall/2;                   // centerlinje-radius, top-krog
R2   = hook_d / 2;                    // indv. radius, hage
r2   = R2 + wall/2;                   // centerlinje-radius, hage
T    = [r1, 0];                       // centrum top-krog
B    = [-r2, -shank];                 // centrum hage
// I ligevaegt ligger T og B lodret under hinanden -> krogen drejer 'tilt' grader
tilt = atan2(r1 + r2, shank);
wrap = hook_wrap < 0 ? max(0, tilt - wrap_margin) : hook_wrap;

// hagens spids
E2   = B + r2 * [-cos(wrap), sin(wrap)];
D2   = [sin(wrap), cos(wrap)];
TIP2 = E2 + hook_tip * D2;
// top-krogens spids
TIP1 = [2*r1, -top_tip];

echo(str("Haeldning naar krogen haenger: ", tilt, " grader"));
echo(str("Ekstra bue paa hagen: ", wrap, " grader"));
echo(str("Aabning ind i hagen: ", TIP2[0] < 0 ? -TIP2[0] - wall : 0, " mm"));
echo(str("Aabning ind i top-krogen: ", 2*r1 - wall, " mm (stang ", rod_d, " mm)"));

// ---------- 2D-byggeklodser ----------
module band_arc(c, r, a0, a1) {           // bue-baand, vinkler a0 -> a1 (grader)
    n = max(8, ceil(abs(a1 - a0) / 2));
    translate(c) polygon(concat(
        [for (i = [0:n])  (r + wall/2) * [cos(a0 + (a1 - a0)*i/n), sin(a0 + (a1 - a0)*i/n)]],
        [for (i = [n:-1:0]) (r - wall/2) * [cos(a0 + (a1 - a0)*i/n), sin(a0 + (a1 - a0)*i/n)]]));
}

module band_line(p, q) {                  // lige baand fra p til q
    d = (q - p) / norm(q - p);
    n = [-d[1], d[0]] * wall/2;
    e = d * 0.01;                         // lille overlap mod buerne
    polygon([p - e + n, q + e + n, q + e - n, p - e - n]);
}

module cap(p) translate(p) circle(d = wall);   // afrundet spids

module profile2d() {
    union() {
        band_arc(T, r1, 0, 180);              // top-krog om stangen
        band_line([2*r1, 0], TIP1);           // top-spids
        cap(TIP1);
        band_line([0, 0], [0, -shank]);       // skaft
        band_arc(B, r2, -180 - wrap, 0);      // hage
        band_line(E2, TIP2);                  // hage-spids
        cap(TIP2);
    }
}

// ---------- 3D: ekstruderet profil med trappe-fas (1 trin pr. ~0,2 mm lag) ----------
module hook3d() {
    difference() {
        hook_body();
        // maerkning i toppen af skaftet - ligger paa krogens neutralakse, saa den ikke svaekker den
        if (label != "")
            translate([0, -shank/2, thick - label_depth])
                linear_extrude(label_depth + 0.01)
                    rotate(-90) text(label, size = label_size, font = label_font,
                                     halign = "center", valign = "center");
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
