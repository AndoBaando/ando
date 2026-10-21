// ============================================================
//  Skilteholder til bakker  -  parametrisk OpenSCAD-model
//  Label:    70 x 29 mm, skubbes ind fra siden (labelvindue)
//  Vinkel:   labelen haelder 45 grader mod kunden (laeses oppefra)
//  Placering: labelen sidder centreret paa bakkens forkant (halvt foran,
//             halvt over kanten) -> lav, og daekker ikke bakkens indhold
//  Montering: klemmes ned over bakkens forkant (U-klemme)
//  Printer:  Prusa MK4S - printes STAAENDE paa den lukkede ende, ingen support (brim 5 mm)
//
//  Maal i mm.  F5 = preview, F6 = render, F7 = eksporter STL.
//  KOORDINATER (som den sidder paa bakken):
//    X = dybde   (0 = kantens yderside mod kunden, + = ind i bakken)
//    Y = bredde  (0 = labelens midte)
//    Z = hoejde  (0 = oversiden af bakkens kant)
// ============================================================

/* [Bakke] */
// "A" = velourbakke, 7,0 mm kant, midter-skillevaeg 3,4 mm (billede 1-3)
// "B" = plastkurv, 2,1 mm kant (billede 4)
// "C" = velourbakke, 7,0 mm kant, rum 71,2 mm bredt (billede 5)
// "custom" = brug custom_* nedenfor
bakke = "A"; // [A, B, C, custom]

custom_rim         = 7.0;  // kantens tykkelse
custom_divider     = 0;    // skillevaeg der skal vaere udskaering over (0 = ingen)
custom_compartment = 0;    // rum-bredde holderens inderben skal passe ned i (0 = fuld bredde)

/* [Label] */
label_w     = 70;    // labelens bredde
label_h     = 29;    // labelens hoejde
label_gap   = 1.0;   // lommens dybde (label + evt. tynd plastfolie foran)
label_clear = 0.6;   // ekstra luft i bredde og hoejde
lip         = 1.5;   // hvor meget rammen overlapper labelens kant
label_angle = 45;    // grader fra VANDRET (90 = lodret, 0 = fladt)
// hvor stor del af labelen der sidder FORAN kanten:
//   0.5 = centreret paa forkanten (default, lav og fri af varerne)
//   0   = hele labelen oppe over bakken (hvis bakkerne staar helt taet)
front_frac  = 0.5;

/* [Klemme] */
fit      = 0.3;  // ekstra luft ved roden af klemmen (samlet)
grip     = 0.4;  // klem ved benenes spids (samlet) - stoerre = strammere
leg_len  = 11;   // hvor langt benene gaar ned over kanten (kanten er ~20)
div_clear  = 0.8;  // luft omkring skillevaeggen i udskaeringen (samlet)
comp_clear = 1.2;  // luft mellem inderben og rummets vaegge (samlet)

/* [Godstykkelser] */
leg_t    = 1.6;
bridge_t = 1.6;
back_t   = 1.4;  // bagpladen bag labelen
lip_t    = 1.0;  // forkanten der holder labelen
rail     = 1.2;  // massiv kant under og over labellommen
end_wall = 1.2;  // lukket ende (stop for labelen)

/* [Visning] */
print_ready = false; // true = drejet til print (staaende paa den lukkede ende)
show_tray   = false; // true = vis bakkekant + label (kun preview)
section     = false; // true = vis kun et tyndt snit paa tvaers (profilen)
preview_text = "Creoler m. zirkonia";

$fn = 32;

// ------------------------------------------------------------
//  AFLEDTE VAERDIER
// ------------------------------------------------------------
function preset(b) =
    b == "A" ? [7.0, 3.4, 0]    :
    b == "B" ? [2.1, 0,   0]    :
    b == "C" ? [7.0, 0,   71.2] :
               [custom_rim, custom_divider, custom_compartment];

P   = preset(bakke);
t   = P[0];                                   // kantens tykkelse
nw  = P[1] > 0 ? P[1] + div_clear  : 0;       // udskaering over skillevaeg
iw  = P[2] > 0 ? P[2] - comp_clear : 0;       // inderbenets bredde (0 = fuld)

pw   = label_w + label_clear;                 // lommens bredde
ph   = label_h + label_clear;                 // lommens hoejde (langs skraaningen)
Lu   = rail + ph + rail;                      // pladens laengde langs skraaningen
vmax = back_t + label_gap + lip_t;            // pladens samlede tykkelse
y0   = -pw/2 - end_wall;                      // lukket ende
y1   =  pw/2;                                 // aaben ende (labelen skubbes ind her)
yc   = -pw/2 + label_w/2;                     // labelens midte naar den ligger mod stoppet

a   = label_angle;
xo  = -fit/2 - leg_t;                         // forside (yderbenets yderside)
xi0 = -fit/2;                                 // yderbenets inderside ved roden
xr0 = t + fit/2;                              // inderbenets inderside ved roden
xr1 = xr0 + leg_t;                            // inderbenets bagside
s_  = [cos(a), sin(a)];                       // op ad skraaningen
n_  = [-sin(a), cos(a)];                      // ud mod kunden
B   = [xo + back_t, bridge_t];                // anker: pladens bagside skaerer klemmens top-forhjoerne
P0  = B - front_frac*Lu*s_;                   // pladens nederste bag-hjoerne
u_strut = front_frac*Lu + (xr1 - B[0])/cos(a);  // hvor stiveren rammer pladen
d1  = 2;      // lige stykke ved roden af udskaeringer, derefter 45 grader (printbart)
fl_h = 1.5;   // indfoerings-fas paa benenes spids
fl_w = 0.8;

function zback(x) = B[1] + (x - B[0]) * tan(a);   // pladens bagside

top_z   = P0[1] + Lu*sin(a) + vmax*cos(a);
front_x = P0[0] - vmax*sin(a);                     // forreste punkt
echo(str(">> Bakke ", bakke, ":  kant ", t, " mm",
         nw > 0 ? str(", udskaering ", nw, " mm over skillevaeg") : "",
         iw > 0 ? str(", inderben ", iw, " mm (passer i rum)") : ""));
echo(str(">> Holder  B x D x H ca. = ", y1 - y0, " x ",
         P0[0] + Lu*cos(a) - min(front_x, xo), " x ", top_z - min(P0[1], -leg_len), " mm"));
echo(str(">> Rager ", top_z, " mm op over kanten, ", -front_x, " mm frem foran kanten, ",
         max(0, P0[0] + Lu*cos(a) - xr1), " mm ind over bakken bag inderbenet"));
echo(str(">> Laveste punkt ", -min(P0[1], -leg_len), " mm under kantens top (kanten er ~20 mm)"));
echo(str(">> Synligt vindue ", pw - lip, " x ", ph - 2*lip, " mm"));
if (u_strut > Lu - 0.5) echo(">> ADVARSEL: pladen naar ikke ind over inderbenet - ingen stiver");

// ------------------------------------------------------------
//  HJAELPERE
// ------------------------------------------------------------
// 2D-profil i (X, Z) -> ekstruderet langs Y fra ya til yb
module ext_y(ya, yb) {
    translate([0, yb, 0]) rotate([90, 0, 0]) linear_extrude(height = yb - ya) children();
}
// 2D-form i (Y, Z) -> ekstruderet langs X fra xa til xb
module ext_x(xa, xb) {
    translate([xa, 0, 0]) rotate([90, 0, 90]) linear_extrude(height = xb - xa) children();
}
// lokal (u = op ad skraaningen, v = ud mod kunden) -> profil (X, Z)
module on_plate() { translate(P0) rotate(a) children(); }

// ------------------------------------------------------------
//  2D-PROFILER (X, Z)
// ------------------------------------------------------------
module outer_leg2d() {
    polygon([[xo, 0.01], [xi0, 0.01],
             [grip/2, -(leg_len - fl_h)], [grip/2 - fl_w, -leg_len], [xo, -leg_len]]);
}
module inner_leg2d() {
    polygon([[xr0, 0.01], [xr1, 0.01], [xr1, -leg_len],
             [t - grip/2 + fl_w, -leg_len], [t - grip/2, -(leg_len - fl_h)]]);
}
module clip2d() {
    outer_leg2d();
    translate([xo, 0]) square([xr1 - xo, bridge_t]);                      // bro over kanten
    // fylder hakket under pladen ved forhjoernet (kun relevant ved front_frac ~ 0)
    polygon([[xo, bridge_t - 0.01], [B[0] + 0.01, bridge_t - 0.01], [xo, bridge_t + back_t/tan(a)]]);
    // kile mellem bro og plade lige bag ankeret (stivere samling)
    g = min(3, xr0 - B[0]);
    polygon([[B[0] - 0.01, bridge_t - 0.01], [B[0] + g, bridge_t - 0.01], [B[0] + g, zback(B[0] + g) + 0.3]]);
    if (u_strut <= Lu - 0.5)                                            // stiver op til pladen
        polygon([[xr0, bridge_t - 0.01], [xr1, bridge_t - 0.01],
                 [xr1, zback(xr1) + 0.5], [xr0, zback(xr0) + 0.5]]);
}
// Lukket endeplade (kun i stop-enden): fylder rummet under pladen UDEN for bakken
// og OVER kanten -> stivere plade og mere flade paa printpladen.
// Holder 0,6 mm fri af yderbenet, saa benet stadig kan fjedre.
module end_panel2d() {
    xp = xo - 0.6;
    if (P0[0] < xp - 0.5)    // foran yderbenet
        polygon([[xp, zback(xp) + 0.01], [xp, P0[1]], P0]);
    if (u_strut <= Lu - 0.5) // over broen, op til stiveren
        polygon([[B[0], bridge_t - 0.01], [xr0 + 0.01, bridge_t - 0.01], [xr0 + 0.01, zback(xr0) + 0.3]]);
}
module plate2d()  { on_plate() square([Lu, vmax]); }
module pocket2d() { on_plate() translate([rail, back_t]) square([ph, label_gap]); }
module window2d() { on_plate() translate([rail + lip, back_t + label_gap - 0.01])
                                   square([ph - 2*lip, lip_t + 1]); }

// ------------------------------------------------------------
//  3D-DELE
// ------------------------------------------------------------
module inner_leg() {
    span = leg_len + 1 - d1;
    difference() {
        intersection() {
            ext_y(y0, y1) inner_leg2d();
            if (iw > 0)   // smallere inderben der passer ned i et rum
                ext_x(xr0 - 1, xr1 + 1)
                    polygon([[yc - iw/2, 1], [yc + iw/2, 1], [yc + iw/2, -d1],
                             [yc + iw/2 - span, -leg_len - 1], [yc - iw/2 + span, -leg_len - 1],
                             [yc - iw/2, -d1]]);
        }
        if (nw > 0)       // udskaering over skillevaeg (45 grader nedad = printbar uden support)
            ext_x(t - 0.5, xr1 + 1)
                polygon([[yc - nw/2, 0.3], [yc + nw/2, 0.3], [yc + nw/2, -d1],
                         [yc + nw/2 + span, -leg_len - 1], [yc - nw/2 - span, -leg_len - 1],
                         [yc - nw/2, -d1]]);
    }
}

module skilteholder() {
    difference() {
        union() {
            ext_y(y0, y1) clip2d();
            ext_y(y0, y0 + end_wall) end_panel2d();
            inner_leg();
            ext_y(y0, y1) plate2d();
        }
        ext_y(-pw/2, y1 + 1) pocket2d();          // lomme (lukket i hoejre ende = stop)
        ext_y(-pw/2 + lip, y1 + 1) window2d();    // vindue
        // indfoerings-fas ved den aabne ende
        hull() {
            ext_y(y1 - 1.0, y1 - 0.99) pocket2d();
            ext_y(y1, y1 + 0.01)
                on_plate() translate([rail, back_t]) square([ph, label_gap + 0.8]);
        }
    }
}

// ------------------------------------------------------------
//  PREVIEW: bakkekant, skillevaegge og label
// ------------------------------------------------------------
module tray_ghost() {
    color([0.93, 0.93, 0.91]) translate([-45, -80, -23]) cube([95, 160, 1]);  // bord
    color([0.12, 0.12, 0.14]) {
        translate([0, -70, -20]) cube([t, 140, 20]);                    // forkant
        translate([0, -70, -22]) cube([45, 140, 2]);                    // bund
        if (nw > 0)
            translate([t, yc - P[1]/2, -20]) cube([40, P[1], 20]);      // midter-skillevaeg
        if (iw > 0)
            for (s = [-1, 1])
                translate([t, yc + s*(P[2]/2 + 1.5) - 1.5, -20]) cube([40, 3, 20]);
    }
    color("white")
        translate([0, yc, 0]) rotate([90, 0, 0]) translate([0, 0, -label_w/2])
            linear_extrude(label_w) on_plate()
                translate([rail + label_clear/2, back_t + 0.2]) square([label_h, 0.2]);
    // tekst paa labelen: tekst-x = mod kundens hoejre (-Y), tekst-y = op ad skraaningen
    uc = rail + label_clear/2 + label_h/2;
    vf = back_t + 0.4;
    color([0.1, 0.1, 0.1])
        multmatrix([[0, cos(a), -sin(a), P0[0] + uc*cos(a) - vf*sin(a)],
                    [-1, 0,     0,       yc],
                    [0, sin(a),  cos(a), P0[1] + uc*sin(a) + vf*cos(a)],
                    [0, 0, 0, 1]])
            linear_extrude(0.1)
                text(preview_text, size = 4.4, halign = "center", valign = "center",
                     font = "DejaVu Sans:style=Bold");
}

// ------------------------------------------------------------
if (print_ready) {
    // staaende paa den lukkede ende -> hele profilen ligger i print-planet
    color([0.85, 0.55, 0.15]) translate([0, 0, -y0]) rotate([90, 0, 0]) skilteholder();
    if (show_tray) color([0.3, 0.3, 0.32]) translate([-35, -40, -1]) cube([80, 70, 1]);  // printplade
} else if (section) {
    // tyndt snit midt mellem udskaering og ende -> viser profilen
    color([0.85, 0.55, 0.15]) intersection() { skilteholder(); translate([-60, 15, -40]) cube([120, 2, 80]); }
    if (show_tray)
        color([0.25, 0.25, 0.28]) intersection() { tray_ghost(); translate([-60, 15.5, -40]) cube([120, 2, 80]); }
} else {
    color([0.85, 0.55, 0.15]) skilteholder();
    if (show_tray) tray_ghost();
}
