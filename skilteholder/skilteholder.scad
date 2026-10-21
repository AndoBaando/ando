// ============================================================
//  Skilteholder til bakker  -  parametrisk OpenSCAD-model
//  Label:    70 x 29 mm - HELE labelen ses i vinduet (fordybning med kant rundt om,
//            labelen saettes/klistres ind forfra)
//  Vinkel:   labelen haelder 45 grader mod kunden (laeses oppefra)
//  Placering: labelen sidder centreret paa bakkens forkant (halvt foran,
//             halvt over kanten) -> lav, og daekker ikke bakkens indhold
//  Montering: haenger paa bakkens forkant - yderben udvendigt, kun en lille
//             krog (2 mm) paa indersiden, saa intet gaar ned i rummene
//  Printer:  Prusa MK4S - printes STAAENDE paa enden, ingen support (brim 5 mm)
//
//  Maal i mm.  F5 = preview, F6 = render, F7 = eksporter STL.
//  KOORDINATER (som den sidder paa bakken):
//    X = dybde   (0 = kantens yderside mod kunden, + = ind i bakken)
//    Y = bredde  (0 = labelens midte)
//    Z = hoejde  (0 = oversiden af bakkens kant)
// ============================================================

/* [Bakke] */
// "A" = velourbakke, 7,0 mm kant, midter-skillevaeg 3,4 mm (billede 1-3)
// "B" = plastkurv, 2,7 mm kant (billede 4)
// "C" = velourbakke, 7,0 mm kant, rum 71,2 mm bredt (billede 5)
// "custom" = brug custom_* nedenfor
bakke = "A"; // [A, B, C, custom]

custom_rim         = 7.0;  // kantens tykkelse
custom_divider     = 0;    // skillevaeg der skal vaere udskaering over (0 = ingen)
custom_compartment = 0;    // rum-bredde krogen skal passe ned i (0 = fuld bredde)

/* [Label] */
label_w     = 70;    // labelens bredde
label_h     = 29;    // labelens hoejde
label_clear = 0.8;   // luft rundt om labelen (samlet) -> vinduet bliver 70,8 x 29,8 mm
recess_d    = 0.8;   // vinduets dybde = hoejden paa kanten rundt om labelen
label_angle = 45;    // grader fra VANDRET (90 = lodret, 0 = fladt)
// hvor stor del af labelen der sidder FORAN kanten:
//   0.5 = centreret paa forkanten (default, lav og fri af varerne)
//   0   = hele labelen oppe over bakken (hvis bakkerne staar helt taet)
front_frac  = 0.5;

/* [Ophaeng] */
fit      = 0.3;  // ekstra luft over kanten ved roden (samlet)
grip     = 0.4;  // klem ved benenes spids (samlet) - stoerre = strammere
leg_len  = 11;   // yderbenet: hvor langt det gaar ned UDEN PAA kanten (kanten er ~20)
inner_lip = 2;   // krogen paa INDERSIDEN: saa langt gaar den ned i bakken (0 = ingen krog)
div_clear  = 0.8;  // luft omkring skillevaeggen i udskaeringen (samlet)
comp_clear = 1.2;  // luft mellem krogen og rummets vaegge (samlet)

/* [Godstykkelser] */
leg_t    = 1.6;
bridge_t = 1.6;
back_t   = 1.4;  // bagpladen bag labelen
rail     = 1.2;  // kant under og over vinduet
end_wall = 1.4;  // kant i enderne af vinduet

/* [Visning] */
print_ready = false; // true = drejet til print (staaende paa enden med endepladen)
show_tray   = false; // true = vis bakkekant + label (kun preview)
section     = false; // true = vis kun et tyndt snit paa tvaers (profilen)
preview_text = "Creoler m. zirkonia";

$fn = 32;

// ------------------------------------------------------------
//  AFLEDTE VAERDIER
// ------------------------------------------------------------
function preset(b) =
    b == "A" ? [7.0, 3.4, 0]    :
    b == "B" ? [2.7, 0,   0]    :
    b == "C" ? [7.0, 0,   71.2] :
               [custom_rim, custom_divider, custom_compartment];

P   = preset(bakke);
t   = P[0];                                   // kantens tykkelse
nw  = P[1] > 0 ? P[1] + div_clear  : 0;       // udskaering over skillevaeg
iw  = P[2] > 0 ? P[2] - comp_clear : 0;       // krogens bredde (0 = fuld)

pw   = label_w + label_clear;                 // vinduets bredde
ph   = label_h + label_clear;                 // vinduets hoejde (langs skraaningen)
Lu   = rail + ph + rail;                      // pladens laengde langs skraaningen
vmax = back_t + recess_d;                     // pladens samlede tykkelse
y0   = -pw/2 - end_wall;                      // enden med endepladen (ligger paa printpladen)
y1   =  pw/2 + end_wall;
yc   = 0;                                     // labelens midte

a   = label_angle;
xo  = -fit/2 - leg_t;                         // forside (yderbenets yderside)
xi0 = -fit/2;                                 // yderbenets inderside ved roden
xr0 = t + fit/2;                              // krogens inderside (mod bakkens inderside)
xr1 = xr0 + leg_t;                            // krogens bagside
s_  = [cos(a), sin(a)];                       // op ad skraaningen
n_  = [-sin(a), cos(a)];                      // ud mod kunden
B   = [xo + back_t, bridge_t];                // anker: pladens bagside skaerer ophaengets top-forhjoerne
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
         iw > 0 ? str(", krog ", iw, " mm bred (passer i rum)") : ""));
echo(str(">> Holder  B x D x H ca. = ", y1 - y0, " x ",
         P0[0] + Lu*cos(a) - min(front_x, xo), " x ", top_z - min(P0[1], -leg_len), " mm"));
echo(str(">> Rager ", top_z, " mm op over kanten, ", -front_x, " mm frem foran kanten, ",
         max(0, P0[0] + Lu*cos(a) - xr1), " mm ind over bakken bag krogen"));
echo(str(">> Laveste punkt ", -min(P0[1], -leg_len), " mm under kantens top (kanten er ~20 mm)"));
echo(str(">> Vindue ", pw, " x ", ph, " mm, ", recess_d, " mm dybt -> hele labelen ", label_w, " x ", label_h,
         " mm kan ses"));
echo(str(">> Gaar kun ", inner_lip, " mm ned paa indersiden af kanten (krog) - rummene er fri"));
if (u_strut > Lu - 0.5) echo(">> ADVARSEL: pladen naar ikke ind over krogen - ingen stiver");

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
module inner_leg2d() {   // kort krog der griber kantens oeverste inderkant
    ch = min(0.7, inner_lip/2);
    if (inner_lip > 0)
        polygon([[xr0, 0.01], [xr1, 0.01], [xr1, -inner_lip],
                 [xr0 + ch, -inner_lip], [xr0, -inner_lip + ch]]);
}
module clip2d() {
    outer_leg2d();
    translate([xo, 0]) square([xr1 - xo, bridge_t]);                      // bro over kanten
    // fylder hakket under pladen ved forhjoernet (kun relevant ved front_frac ~ 0)
    polygon([[xo, bridge_t - 0.01], [B[0] + 0.01, bridge_t - 0.01], [xo, bridge_t + back_t/tan(a)]]);
    // kile mellem bro og plade lige bag ankeret (stivere samling)
    g = (xr0 - B[0] < 4) ? xr0 - B[0] + 0.01 : 3;   // smal kant: fyld helt ud til stiveren (ingen tynd sprække)
    polygon([[B[0] - 0.01, bridge_t - 0.01], [B[0] + g, bridge_t - 0.01], [B[0] + g, zback(B[0] + g) + 0.3]]);
    if (u_strut <= Lu - 0.5)                                            // stiver op til pladen
        polygon([[xr0, bridge_t - 0.01], [xr1, bridge_t - 0.01],
                 [xr1, zback(xr1) + 0.5], [xr0, zback(xr0) + 0.5]]);
}
// Endeplade (kun i den ene ende): fylder rummet under pladen UDEN for bakken
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
// vinduets tvaersnit fra bagpladen (v0) og frem (dv)
module recess2d(v0, dv) { on_plate() translate([rail, v0]) square([ph, dv]); }

// ------------------------------------------------------------
//  3D-DELE
// ------------------------------------------------------------
module inner_leg() {
    dI   = min(d1, inner_lip);
    span = inner_lip + 1 - dI;
    difference() {
        intersection() {
            ext_y(y0, y1) inner_leg2d();
            if (iw > 0)   // smallere krog der passer ned i et rum (centrerer paa rummet)
                ext_x(xr0 - 1, xr1 + 1)
                    polygon([[yc - iw/2, 1], [yc + iw/2, 1], [yc + iw/2, -dI],
                             [yc + iw/2 - span, -inner_lip - 1], [yc - iw/2 + span, -inner_lip - 1],
                             [yc - iw/2, -dI]]);
        }
        if (nw > 0)       // udskaering over skillevaeg (centrerer paa skillevaeggen)
            ext_x(t - 0.5, xr1 + 1)
                polygon([[yc - nw/2, 0.3], [yc + nw/2, 0.3], [yc + nw/2, -dI],
                         [yc + nw/2 + span, -inner_lip - 1], [yc - nw/2 - span, -inner_lip - 1],
                         [yc - nw/2, -dI]]);
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
        // vinduet: fordybning paa 70,8 x 29,8 mm. Enderne er skraa (45 grader),
        // saa kanten i den oeverste ende kan printes uden support.
        hull() {
            ext_y(-pw/2, pw/2) recess2d(back_t, 0.01);
            ext_y(-pw/2 - recess_d, pw/2 + recess_d) recess2d(vmax, 1);
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
                translate([rail + label_clear/2, back_t]) square([label_h, 0.15]);   // klistret i vinduet
    // tekst paa labelen: tekst-x = mod kundens hoejre (-Y), tekst-y = op ad skraaningen
    uc = rail + label_clear/2 + label_h/2;
    vf = back_t + 0.2;
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
    // staaende paa enden -> hele profilen ligger i print-planet
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
