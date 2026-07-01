// ============================================================
//  iPad-holder til butik  -  parametrisk OpenSCAD-model
//  Enhed:    Apple iPad 11 (A16, 2025)   248.6 x 179.5 x 7.2 mm
//  Printer:  Prusa MK4S  (bed 250 x 210 x 220 mm)
//  Stil:     laenende bordstander med kabel-udsparing (a la Durable)
//
//  Maal i millimeter.  Aendr tallene nedenfor, F5 = preview, F6 = render,
//  F7 = eksporter STL  ->  slices i PrusaSlicer.
//
//  KOORDINATER:  X = dybde (0 = forkant),  Y = bredde,  Z = hoejde
// ============================================================

/* [Orientering] */
orientation = "portrait";   // "portrait" (USB-C i bunden) eller "landscape"

/* [Enhedens maal - iPad 11 A16] */
device_long  = 248.6;
device_short = 179.5;
device_native_thickness = 7.2;   // bar iPad (kun til reference)

/* [Cover / pasform] */
// Tykkelsen slidsen laves til = iPad + evt. cover + slip:
//   bar iPad ~9,  tyndt cover ~12 (DEFAULT),  robust cover ~18
slot_thickness = 12;

/* [Vinkel & stoette] */
lean_angle   = 30;    // grader fra LODRET. 30 = god vinkel naar man staar og kigger NED.
                      //   mere oprejst (12-20) = til skaerm i oejenhoejde
                      //   mere tilbagelaenet (35-45) = kunde staar taet paa / lav disk
support_frac = 0.50;  // hvor stor del af iPad-hoejden ryglaenet daekker (0.3-0.6)
lip_height   = 9;     // frontkantens hoejde. Holdes < 10.8*cos(vinkel) saa den KUN
                      //   daekker rammen (bezel ~10.8 mm), ikke selve skaermen.
lip_thick    = 7;     // godstykkelse i frontlaeben
side_grip    = 10;    // hoejde paa sidetapper der fastholder hjoernerne (0 = ingen)

/* [Fundament] */
base_depth   = 130;   // dybde af fundament (stoerre = mere stabilt mod vip). Skal
                      //   vaere stoerre naar iPaden laenes mere tilbage.
base_height  = 16;    // tykkelse af bundplade (rummer kabelkanal)
wall_thick   = 9;     // godstykkelse i ryglaenet
extra_width  = 12;    // ekstra bredde ud over iPad (2 x sidetap). default 2x6

/* [Kabel - USB-C i bunden (portrait)] */
plug_w       = 20;    // bredde af aabning ved ladestikket
cable_groove_w = 9;   // bredde af kabelrille bagud i bunden
cable_groove_h = 7;   // hoejde af kabelrille (rille er aaben i bunden -> ingen bro)

/* [Montering] */
screw_holes  = false; // true = 4 huller til at skrue holderen fast til disken
screw_d      = 4.5;
screw_head_d = 9;

/* [Visning] */
show_device = false;  // true = tegn en "spoegelses-iPad" i holderen (kun til preview)

/* [Finhed] */
$fn = 72;

// ------------------------------------------------------------
//  AFLEDTE VAERDIER
// ------------------------------------------------------------
clear   = 0.6;                                  // slip pr. side
ipad_w  = (orientation == "portrait") ? device_short : device_long;  // langs Y
ipad_h  = (orientation == "portrait") ? device_long  : device_short; // langs laenet
cradle_w  = ipad_w + 2*clear + extra_width;     // holderens bredde (Y)
support_h = ipad_h * support_frac;              // ryglaenets laengde
a  = lean_angle;
zr = base_height;                               // iPad'ens underkant hviler her
bx = lip_thick + clear + slot_thickness;        // bagkant af slids ved bunden

echo(str(">> Holder  B x D x H ca. = ", cradle_w, " x ", base_depth, " x ",
         zr + support_h*cos(a) + wall_thick*sin(a), " mm"));
// Kontrol: laeben maa hoejst daekke rammen (bezel ~10.8 mm) - ikke skaermen
echo(str(">> Laeben daekker ", lip_height/cos(a), " mm af iPad-fladen (ramme = ~10.8 mm)"));
// Kontrol: iPad'ens tyngdepunkt skal ligge godt inde paa fundamentet (0..base_depth)
echo(str(">> iPad tyngdepunkt ", bx + (ipad_h/2)*sin(a) - device_native_thickness/2*cos(a),
         " mm fra forkant (fundament er ", base_depth, " mm dybt)"));

// ------------------------------------------------------------
//  2D SIDEPROFIL (X-Z), ekstruderes paa tvaers (Y)
// ------------------------------------------------------------
module profile() {
    // fundament
    square([base_depth, base_height]);
    // frontlaebe (gaar helt ned i fundamentet -> overlap, undgaar ikke-manifold)
    square([lip_thick, zr + lip_height]);
    // laenende ryglaen: laen-linjen gaar gennem B=(bx,zr); forlaenges ned til z=0
    // saa den overlapper fundamentet uden coincidente flader.
    Lbot = -zr / cos(a);                                  // parameter ned til z=0
    fb = [bx + Lbot*sin(a), 0];                           // front-bund (forlaenget)
    ft = [bx + support_h*sin(a), zr + support_h*cos(a)];  // front-top
    polygon([
        fb,
        ft,
        [ft[0] + wall_thick, ft[1]],                      // bag-top
        [fb[0] + wall_thick, 0]                           // bag-bund
    ]);
}

module body() {
    rotate([90, 0, 0])
        translate([0, 0, -cradle_w/2])
            linear_extrude(height = cradle_w)
                profile();
}

// sidetapper der holder de nederste hjoerner paa plads
module side_tabs() {
    tab_w = cradle_w/2 - (ipad_w/2 + clear);               // = extra_width/2
    if (side_grip > 0)
        for (s = [-1, 1]) {
            y0 = (s == 1) ? (ipad_w/2 + clear) : -cradle_w/2;
            translate([0, y0, zr - 4])                     // -4 = overlap ned i fundament
                cube([bx + 2, tab_w, side_grip + slot_thickness + 4]);
        }
}

// kabel: aaben slids ved stikket + rille bagud i bunden
module cable_cut() {
    // aabning ved USB-C stikket (gennem laebe + hylde, op forbi underkanten)
    translate([-1, -plug_w/2, -1])
        cube([bx + 4 + 1, plug_w, zr + 8 + 1]);
    // rille bagud i bunden (aaben nedad -> ingen bro noedvendig ved print)
    translate([lip_thick, -cable_groove_w/2, -1])
        cube([base_depth - lip_thick + 1, cable_groove_w, cable_groove_h + 1]);
}

module screw_cuts() {
    if (screw_holes) {
        inset = 16;
        ys = cradle_w/2 - inset;
        for (sx = [inset, base_depth - inset], sy = [-ys, ys]) {
            translate([sx, sy, -1]) cylinder(d = screw_d, h = base_height + 2);
            translate([sx, sy, base_height - 4]) cylinder(d = screw_head_d, h = 5);
        }
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
        }
        cable_cut();
        screw_cuts();
    }
}

// "spoegelses-iPad" til at verificere pasform i preview
module ghost_device() {
    // bag-underkanten sidder ved B=(bx,zr) og laener samme vej som ryglaenet;
    // tykkelsen gaar mod skaermsiden (-X), saa bagfladen ligger paa laenet.
    color([0.2, 0.4, 0.9, 0.45])
        translate([bx, -ipad_w/2, zr])
            rotate([0, a, 0])
                translate([-device_native_thickness, 0, 0])
                    cube([device_native_thickness, ipad_w, ipad_h]);
}

ipad_holder();
if (show_device) ghost_device();
