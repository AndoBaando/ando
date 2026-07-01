// ============================================================
//  iPad-holder til butik  -  parametrisk OpenSCAD-model  (v2)
//  Enhed:    Apple iPad 11 (A16, 2025)   248.6 x 179.5 x 7.2 mm
//  Printer:  Prusa MK4S  (bed 250 x 210 x 220 mm)
//  Stil:     laenende bordstander, VENTILERET ryglaen, kabel-udsparing
//
//  v2-forbedringer (efter research af retail-stativer, print-styrke og varme):
//   - Ventileret ryglaen (aabne vinduer): iPad'en lader permanent og bliver
//     varm; ved >35 C SAETTER iPad'en opladning paa pause. Aaben bagside +
//     luftgab = koeler. Sparer ogsaa filament og mindsker warping.
//   - Skridsikre foedder: forsaenkede lommer til selvklaebende gummifoedder.
//   - Kabel-aflastning: skuldre fanger stikket saa et ryk i kablet ikke
//     trraekker det ud af porten.
//   - Bag-gusset + solid bund-baelte: stiver ryglaenets rod af (svageste punkt
//     naar en kunde trykker paa skaermen).
//   - Valgfri vaegtlomme: fyld med metal/sand for ekstra stabilitet.
//   - Fas paa forreste bundkant.
//
//  Maal i mm.  F5 = preview, F6 = render, F7 = eksporter STL.
//  KOORDINATER:  X = dybde (0 = forkant),  Y = bredde,  Z = hoejde
// ============================================================

/* [Orientering] */
orientation = "portrait";   // "portrait" (USB-C i bunden) eller "landscape"

/* [Enhedens maal - iPad 11 A16] */
device_long  = 248.6;
device_short = 179.5;
device_native_thickness = 7.2;

/* [Cover / pasform] */
// Slidsens tykkelse = iPad + evt. cover + slip:
//   bar iPad ~9,  tyndt cover ~12 (DEFAULT),  robust cover ~18
slot_thickness = 12;

/* [Vinkel & stoette] */
lean_angle   = 30;    // grader fra LODRET. 30 = god vinkel naar man staar og kigger NED.
support_frac = 0.50;  // hvor stor del af iPad-hoejden ryglaenet daekker (0.3-0.6)
lip_height   = 9;     // frontkantens hoejde (< 10.8*cos(vinkel) -> daekker kun rammen)
lip_thick    = 7;     // godstykkelse i frontlaeben
side_grip    = 10;    // hoejde paa sidetapper der fastholder hjoernerne (0 = ingen)

/* [Fundament] */
base_depth   = 130;   // dybde af fundament (stoerre = mere stabilt mod vip)
base_height  = 16;    // tykkelse af bundplade
wall_thick   = 9;     // godstykkelse i ryglaenet
extra_width  = 12;    // ekstra bredde ud over iPad (2 x sidetap)
front_chamfer = 3;    // fas paa forreste OG bageste oeverste bundkant (0 = ingen)

/* [Ventilation i ryglaenet] */
vent          = true; // ventilations-grille i ryglaenet (anbefales - se varme-note)
vent_border_b = 18;   // solidt baelte i bunden af ryglaenet (stivhed ved roden)
vent_border_t = 14;   // solid kant i toppen
vent_slot_w   = 13;   // bredde pr. ventilationsslids (smal -> printer uden bro-hang)
vent_rib      = 9;    // ribbe mellem slidser (iPad hviler paa ribberne)
vent_span     = 150;  // samlet bredde af ventilationsfeltet
gusset_w      = 46;   // bredde paa bag-gusset ved roden

/* [Kabel + aflastning - USB-C i bunden (portrait)] */
plug_w        = 20;   // bredde af aabning ved ladestikket
plug_relief_z = 9;    // hoejde hvor aabningen indsnaevres -> skulder fanger stikket
cable_groove_w = 9;   // bredde af kabelrille bagud i bunden
cable_groove_h = 7;   // hoejde af kabelrille (aaben nedad -> ingen bro)
strain_relief = true; // to naber i rillen der klemmer kablet (aflastning)
strain_gap    = 4;    // aabning mellem naber (kabel presses forbi og holdes)

/* [Skridsikre foedder] */
feet          = true; // forsaenkede lommer til selvklaebende gummifoedder
foot_d        = 12;   // diameter
foot_depth    = 2.2;  // dybde (typisk gummifod ~2 mm)

/* [Montering / vaegt (valgfrit)] */
screw_holes   = false; // 4 huller til at skrue holderen fast til disken
screw_d       = 4.5;
screw_head_d  = 9;
weight_pocket = false; // to lommer i bunden til metal/sand (ekstra stabilitet)

/* [Visning] */
show_device = false;  // true = tegn en "spoegelses-iPad" (kun preview)

/* [Finhed] */
$fn = 72;

// ------------------------------------------------------------
//  AFLEDTE VAERDIER
// ------------------------------------------------------------
clear   = 0.6;
ipad_w  = (orientation == "portrait") ? device_short : device_long;
ipad_h  = (orientation == "portrait") ? device_long  : device_short;
cradle_w  = ipad_w + 2*clear + extra_width;
support_h = ipad_h * support_frac;
a  = lean_angle;
zr = base_height;
bx = lip_thick + clear + slot_thickness;

echo(str(">> Holder  B x D x H ca. = ", cradle_w, " x ", base_depth, " x ",
         zr + support_h*cos(a) + wall_thick*sin(a), " mm"));
echo(str(">> Laeben daekker ", lip_height/cos(a), " mm af iPad-fladen (ramme = ~10.8 mm)"));
echo(str(">> iPad tyngdepunkt ", bx + (ipad_h/2)*sin(a) - device_native_thickness/2*cos(a),
         " mm fra forkant (fundament er ", base_depth, " mm dybt)"));

// Hjaelper: placer 'children' i ryglaenets lokale plan.
//   lokal X = ind i ryglaenet (0 = forflade mod iPad),  Y = sideled,  Z = op ad laenet
module in_lean() {
    translate([bx, 0, zr]) rotate([0, a, 0]) children();
}

// ------------------------------------------------------------
//  2D SIDEPROFIL (X-Z) -> ekstruderes paa tvaers (Y)
// ------------------------------------------------------------
module profile() {
    square([base_depth, base_height]);                 // fundament
    square([lip_thick, zr + lip_height]);              // frontlaebe (overlapper bund)
    Lbot = -zr / cos(a);
    fb = [bx + Lbot*sin(a), 0];
    ft = [bx + support_h*sin(a), zr + support_h*cos(a)];
    polygon([ fb, ft, [ft[0] + wall_thick, ft[1]], [fb[0] + wall_thick, 0] ]);  // laenende ryglaen
}

module body() {
    rotate([90, 0, 0]) translate([0, 0, -cradle_w/2])
        linear_extrude(height = cradle_w) profile();
}

// Bag-gusset: fin bag ryglaenets rod under midterribben -> stivhed mod tryk
module gusset() {
    G = 26;      // hvor langt gussen stikker bagud
    Hg = 42;     // hvor hoejt op ad ryglaenets bagside
    in_lean()
        translate([wall_thick - 0.01, -gusset_w/2, -10])
            rotate([90, 0, 90])
                linear_extrude(height = gusset_w)
                    polygon([[0, 0], [G, 0], [0, Hg + 10]]);
}

// Sidetapper der holder de nederste hjoerner
module side_tabs() {
    tab_w = cradle_w/2 - (ipad_w/2 + clear);
    if (side_grip > 0)
        for (s = [-1, 1]) {
            y0 = (s == 1) ? (ipad_w/2 + clear) : -cradle_w/2;
            translate([0, y0, zr - 4]) cube([bx + 2, tab_w, side_grip + slot_thickness + 4]);
        }
}

// ---- Fratraek (huller/udsparinger) ----

// Ventilationsvinduer i ryglaenet
module vent_cut() {
    if (vent) {
        period = vent_slot_w + vent_rib;
        n = floor((vent_span + vent_rib) / period);    // antal slidser
        total = n*period - vent_rib;                    // faktisk feltbredde
        slot_len = support_h - vent_border_b - vent_border_t;
        for (i = [0 : n-1]) {
            yc = -total/2 + vent_slot_w/2 + i*period;
            in_lean()
                translate([-1, yc - vent_slot_w/2, vent_border_b])
                    cube([wall_thick + 2, vent_slot_w, slot_len]);
        }
    }
}

// Kabel: bred aabning ved stik + rille bagud med indsnaevret "throat" (aflastning)
module cable_cut() {
    // bred aabning til stik/connector (plads til vinkel-stik anbefales)
    translate([-1, -plug_w/2, plug_relief_z])
        cube([bx + 6, plug_w, (zr + 10) - plug_relief_z]);
    // lodret forbindelse ned til rille (kabel-bredde)
    translate([-1, -cable_groove_w/2, -1])
        cube([bx + 6, cable_groove_w, plug_relief_z + 2]);
    // rille bagud i bunden (aaben nedad -> ingen bro). Throat klemmer kablet.
    xt = base_depth - 42;                                  // throat-position
    translate([lip_thick, -cable_groove_w/2, -1])          // front-segment
        cube([xt - lip_thick, cable_groove_w, cable_groove_h + 1]);
    gw = strain_relief ? strain_gap : cable_groove_w;      // throat-bredde
    translate([xt, -gw/2, -1])
        cube([9, gw, cable_groove_h + 1]);
    translate([xt + 9, -cable_groove_w/2, -1])             // bag-segment
        cube([base_depth - (xt + 9) + 1, cable_groove_w, cable_groove_h + 1]);
}

module feet_cut() {
    if (feet) {
        inset = 15;
        for (sx = [inset, base_depth - inset], sy = [-(cradle_w/2 - inset), cradle_w/2 - inset])
            translate([sx, sy, -0.01]) cylinder(d = foot_d, h = foot_depth);
    }
}

// Fas paa forreste OG bageste NEDERSTE bundkant (mod elefantfod + blID kant)
module chamfer_cut() {
    if (front_chamfer > 0) {
        c = front_chamfer * 1.42;
        for (x0 = [0, base_depth])
            translate([x0, 0, 0])
                rotate([0, 45, 0])
                    translate([-c/2, -cradle_w/2 - 1, -c/2])
                        cube([c, cradle_w + 2, c]);
    }
}

module screw_cuts() {
    if (screw_holes) {
        inset = 15;
        ys = cradle_w/2 - inset;
        for (sx = [inset + 8, base_depth - inset], sy = [-ys, ys]) {
            translate([sx, sy, -1]) cylinder(d = screw_d, h = base_height + 2);
            translate([sx, sy, base_height - 4]) cylinder(d = screw_head_d, h = 5);
        }
    }
}

// Vaegtlomme: to LUKKEDE hulrum (fyld via print-pause med staal-hagl/sand, se README)
module weight_cut() {
    if (weight_pocket) {
        pw = cradle_w * 0.28;
        pd = base_depth * 0.46;
        for (s = [-1, 1])
            translate([base_depth*0.30, s*(cradle_w*0.22) - pw/2, 3])
                cube([pd, pw, base_height - 6]);   // 3 mm gods top og bund -> lukket
    }
}

// ------------------------------------------------------------
//  SAMLET MODEL
// ------------------------------------------------------------
module ipad_holder() {
    difference() {
        union() {
            body();
            side_tabs();
            gusset();
        }
        vent_cut();
        cable_cut();
        feet_cut();
        chamfer_cut();
        screw_cuts();
        weight_cut();
    }
}

// "spoegelses-iPad" til pasform
module ghost_device() {
    color([0.2, 0.4, 0.9, 0.45])
        translate([bx, -ipad_w/2, zr]) rotate([0, a, 0])
            translate([-device_native_thickness, 0, 0])
                cube([device_native_thickness, ipad_w, ipad_h]);
}

ipad_holder();
if (show_device) ghost_device();
