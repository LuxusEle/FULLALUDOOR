require 'sketchup.rb'

module AlumexSingleDoor
  extend self

  ROOT = 'C:/Users/asank/Documents/ALU DOOR'.freeze
  DXF_DIR = File.join(ROOT, 'PROFILE/Alumex_All_Profiles_DXF_Complete/individual').freeze
  OUT_DIR = File.join(ROOT, 'output/sketchup').freeze
  SKP_PATH = File.join(OUT_DIR, 'Alumex_100mm_Single_Butt_Hinge_Door.skp').freeze
  PNG_PATH = File.join(OUT_DIR, 'Alumex_100mm_Single_Butt_Hinge_Door_preview.png').freeze

  DOOR_W = 1000.0
  DOOR_H = 2100.0
  LEAF_LEFT = 52.0
  LEAF_RIGHT = 948.0
  LEAF_BOTTOM = 20.0
  LEAF_TOP = 2048.0
  STILE_FACE = 45.0

  def mm(v)
    v.to_f.mm
  end

  def vec(x, y, z)
    Geom::Vector3d.new(x, y, z)
  end

  def pt(x, y, z)
    Geom::Point3d.new(mm(x), mm(y), mm(z))
  end

  def material(model, name, color, alpha = 1.0)
    mat = model.materials[name] || model.materials.add(name)
    mat.color = Sketchup::Color.new(*color)
    mat.alpha = alpha
    mat
  end

  def tag(model, name)
    model.layers[name] || model.layers.add(name)
  end

  def signed_area(loop)
    loop.each_with_index.sum do |p, i|
      q = loop[(i + 1) % loop.length]
      p[0] * q[1] - q[0] * p[1]
    end / 2.0
  end

  # The supplied individual DXFs are ASCII AC1024 files containing closed
  # LWPOLYLINE entities on layer PROFILE. Bulges were already tessellated in
  # the saved library, so their vertices can be used without approximation.
  def dxf_loops(section)
    lines = File.readlines(File.join(DXF_DIR, "#{section}.dxf"), chomp: true)
    pairs = []
    lines.each_slice(2) { |a, b| pairs << [a.to_i, b.to_s.strip] if b }
    loops = []
    entity = nil
    current = nil
    pending_x = nil
    in_entities = false

    pairs.each do |code, value|
      if code == 0 && value == 'SECTION'
        entity = nil
      elsif code == 2 && value == 'ENTITIES'
        in_entities = true
      elsif code == 0 && value == 'ENDSEC'
        in_entities = false
      elsif in_entities && code == 0
        if entity == 'LWPOLYLINE' && current && current[:layer] == 'PROFILE' && current[:closed]
          loops << current[:points] if current[:points].length >= 3
        end
        entity = value
        current = entity == 'LWPOLYLINE' ? { layer: '0', closed: false, points: [] } : nil
        pending_x = nil
      elsif in_entities && entity == 'LWPOLYLINE' && current
        case code
        when 8 then current[:layer] = value
        when 70 then current[:closed] = (value.to_i & 1) == 1
        when 10 then pending_x = value.to_f
        when 20
          if pending_x
            current[:points] << [pending_x, value.to_f]
            pending_x = nil
          end
        end
      end
    end
    if entity == 'LWPOLYLINE' && current && current[:layer] == 'PROFILE' && current[:closed]
      loops << current[:points] if current[:points].length >= 3
    end
    raise "No closed PROFILE loop in #{section}.dxf" if loops.empty?

    min_x = loops.flatten(1).map(&:first).min
    min_y = loops.flatten(1).map(&:last).min
    loops.map { |lp| lp.map { |x, y| [x - min_x, y - min_y] } }
         .sort_by { |lp| -signed_area(lp).abs }
  end

  def apply_material(entities, mat)
    entities.grep(Sketchup::Face).each do |face|
      face.material = mat
      face.back_material = mat
    end
  end

  def profile_definition(model, section, length_mm, mat)
    key = "DXF_#{section}_L#{length_mm.round(3)}"
    existing = model.definitions[key]
    return existing if existing

    loops = dxf_loops(section)
    definition = model.definitions.add(key)
    ents = definition.entities
    outer = loops.shift
    face = ents.add_face(outer.map { |x, y| pt(x, y, 0) })
    raise "Could not form outer face for #{section}" unless face&.valid?
    face.reverse! if face.normal.z < 0
    inner_faces = loops.filter_map do |lp|
      f = ents.add_face(lp.map { |x, y| pt(x, y, 0) })
      f if f&.valid? && f != face
    end
    inner_faces.each { |f| f.erase! if f.valid? }
    face.pushpull(mm(length_mm))
    apply_material(ents, mat)
    definition.set_attribute('Alumex', 'section', section)
    definition.set_attribute('Alumex', 'length_mm', length_mm)
    definition.set_attribute('Alumex', 'source_dxf', File.join(DXF_DIR, "#{section}.dxf"))
    definition
  end

  def place_profile(model, parent, section, length, origin, xaxis, yaxis, zaxis, mat, label, assembly)
    definition = profile_definition(model, section, length, mat)
    tr = Geom::Transformation.axes(pt(*origin), vec(*xaxis), vec(*yaxis), vec(*zaxis))
    instance = parent.add_instance(definition, tr)
    instance.name = label
    instance.layer = tag(model, assembly)
    instance.set_attribute('Alumex', 'section', section)
    instance.set_attribute('Alumex', 'length_mm', length)
    instance.set_attribute('Alumex', 'origin_mm', origin.join(','))
    instance.set_attribute('Alumex', 'basis', "X=#{xaxis.join(',')} Y=#{yaxis.join(',')} Z=#{zaxis.join(',')}")
    instance
  end

  def add_box(parent, origin, size, mat, name, layer = nil)
    group = parent.add_group
    group.name = name
    group.layer = layer if layer
    x, y, z = origin
    sx, sy, sz = size
    face = group.entities.add_face(pt(x, y, z), pt(x + sx, y, z), pt(x + sx, y + sy, z), pt(x, y + sy, z))
    face.pushpull(mm(sz))
    apply_material(group.entities, mat)
    group
  end

  def cylinder_definition(model, name, radius, length, mat, sides = 20)
    existing = model.definitions[name]
    return existing if existing
    definition = model.definitions.add(name)
    circle = definition.entities.add_circle(ORIGIN, Z_AXIS, mm(radius), sides)
    face = definition.entities.add_face(circle)
    face.reverse! if face.normal.z < 0
    face.pushpull(mm(length))
    apply_material(definition.entities, mat)
    definition
  end

  def axis_transform(origin, axis, x_hint = [1, 0, 0])
    z = vec(*axis).normalize
    x = vec(*x_hint)
    x = vec(0, 1, 0) if x.parallel?(z)
    y = z.cross(x).normalize
    x = y.cross(z).normalize
    Geom::Transformation.axes(pt(*origin), x, y, z)
  end

  def add_cylinder_instance(model, parent, definition, origin, axis, name, layer)
    instance = parent.add_instance(definition, axis_transform(origin, axis))
    instance.name = name
    instance.layer = layer
    instance
  end

  def screw_definition(model, name, shank_d, shank_l, head_d, head_h, mat)
    existing = model.definitions[name]
    return existing if existing
    definition = model.definitions.add(name)
    shank = definition.entities.add_group
    c = shank.entities.add_circle(ORIGIN, Z_AXIS, mm(shank_d / 2.0), 16)
    f = shank.entities.add_face(c)
    f.reverse! if f.normal.z < 0
    f.pushpull(mm(shank_l))
    apply_material(shank.entities, mat)
    head = definition.entities.add_group
    c2 = head.entities.add_circle(pt(0, 0, -head_h), Z_AXIS, mm(head_d / 2.0), 20)
    f2 = head.entities.add_face(c2)
    f2.reverse! if f2.normal.z < 0
    f2.pushpull(mm(head_h))
    apply_material(head.entities, mat)
    # Cross recess is represented by two dark grooves in the head.
    groove_mat = material(model, 'Fastener recess', [55, 55, 58])
    add_box(head.entities, [-head_d * 0.3, -0.35, -head_h - 0.15], [head_d * 0.6, 0.7, 0.25], groove_mat, 'Phillips slot')
    add_box(head.entities, [-0.35, -head_d * 0.3, -head_h - 0.15], [0.7, head_d * 0.6, 0.25], groove_mat, 'Phillips slot')
    definition
  end

  def hinge_definition(model, aluminium, steel, dark)
    existing = model.definitions['Butt_Hinge_100mm']
    return existing if existing
    definition = model.definitions.add('Butt_Hinge_100mm')
    ents = definition.entities
    add_box(ents, [-28, -1.5, -50], [28, 3, 100], steel, 'Frame leaf')
    add_box(ents, [0, -1.5, -50], [28, 3, 100], steel, 'Door leaf')
    pin = cylinder_definition(model, 'Hinge_Pin_D8_L104', 4, 104, dark, 24)
    add_cylinder_instance(model, ents, pin, [0, 0, -52], [0, 0, 1], 'Hinge pin', tag(model, '03_HARDWARE'))
    # Alternating knuckles make the hinge readable at normal model scale.
    knuckle = cylinder_definition(model, 'Hinge_Knuckle_D12_L20', 6, 20, steel, 24)
    [-49, -9, 31].each { |z| add_cylinder_instance(model, ents, knuckle, [0, 0, z], [0, 0, 1], 'Knuckle', tag(model, '03_HARDWARE')) }
    definition
  end

  def add_bead_run(model, ents, section_mat, section, length, origin, horizontal, front, name)
    if horizontal
      y_axis = front ? [0, 0, 1] : [0, 0, -1]
      place_profile(model, ents, section, length, origin, [0, 1, 0], y_axis, [1, 0, 0], section_mat, name, '02_GLAZING_BEADS')
    else
      face_axis = front ? [1, 0, 0] : [-1, 0, 0]
      place_profile(model, ents, section, length, origin, [0, 1, 0], face_axis, [0, 0, 1], section_mat, name, '02_GLAZING_BEADS')
    end
  end

  def add_glazing_set(model, ents, glass_mat, rubber_mat, aluminium, x0, x1, z0, z1, label)
    glass_y = 47.0
    glass_t = 6.0
    glass = add_box(ents, [x0, glass_y - glass_t / 2.0, z0], [x1 - x0, glass_t, z1 - z0], glass_mat, "#{label} 6mm glass", tag(model, '02_GLAZING'))
    glass.set_attribute('Alumex', 'glass_thickness_mm', glass_t)
    # Black EPDM perimeter, on both faces.
    gasket = 3.0
    [glass_y - glass_t / 2.0 - 1.5, glass_y + glass_t / 2.0].each_with_index do |gy, side|
      add_box(ents, [x0, gy, z0], [x1 - x0, 1.5, gasket], rubber_mat, "#{label} gasket #{side} bottom", tag(model, '02_GLAZING'))
      add_box(ents, [x0, gy, z1 - gasket], [x1 - x0, 1.5, gasket], rubber_mat, "#{label} gasket #{side} top", tag(model, '02_GLAZING'))
      add_box(ents, [x0, gy, z0], [gasket, 1.5, z1 - z0], rubber_mat, "#{label} gasket #{side} left", tag(model, '02_GLAZING'))
      add_box(ents, [x1 - gasket, gy, z0], [gasket, 1.5, z1 - z0], rubber_mat, "#{label} gasket #{side} right", tag(model, '02_GLAZING'))
    end
    # Actual 100D-501 bead sections, four edges on each face.
    [[34.0, true], [60.0, false]].each do |depth, front|
      add_bead_run(model, ents, aluminium, '100D-501', x1 - x0, [x0, depth, z0], true, front, "#{label} #{front ? 'front' : 'back'} bottom bead")
      add_bead_run(model, ents, aluminium, '100D-501', x1 - x0, [x0, depth, z1], true, !front, "#{label} #{front ? 'front' : 'back'} top bead")
      add_bead_run(model, ents, aluminium, '100D-501', z1 - z0, [x0, depth, z0], false, front, "#{label} #{front ? 'front' : 'back'} left bead")
      add_bead_run(model, ents, aluminium, '100D-501', z1 - z0, [x1, depth, z0], false, !front, "#{label} #{front ? 'front' : 'back'} right bead")
    end
  end

  def add_handle_set(model, ents, steel, dark)
    hardware = tag(model, '03_HARDWARE')
    # Lock case and latch tongue in the 100D-103 stile.
    add_box(ents, [918, 35, 930], [24, 24, 190], dark, 'Mortise lock case', hardware)
    add_box(ents, [941, 43, 1014], [14, 8, 18], steel, 'Latch tongue', hardware)
    spindle = cylinder_definition(model, 'Handle_Spindle_D8_L90', 4, 90, steel, 20)
    add_cylinder_instance(model, ents, spindle, [922, 5, 1023], [0, 1, 0], 'Handle spindle', hardware)
    rose = cylinder_definition(model, 'Handle_Rose_D50_T8', 25, 8, steel, 32)
    lever = cylinder_definition(model, 'Handle_Lever_D16_L125', 8, 125, steel, 24)
    [[28, -1], [66, 1]].each_with_index do |(y, dir), i|
      add_cylinder_instance(model, ents, rose, [922, y, 1023], [0, dir, 0], "Handle rose #{i + 1}", hardware)
      add_cylinder_instance(model, ents, lever, [922, y + dir * 8, 1023], [1, 0, 0], "Lever handle #{i + 1}", hardware)
    end
  end

  def add_orientation_axes(model, ents, red, green, blue)
    guides = tag(model, '99_GUIDES')
    xdef = cylinder_definition(model, 'Axis_X_400', 2.5, 400, red, 16)
    ydef = cylinder_definition(model, 'Axis_Y_250', 2.5, 250, green, 16)
    zdef = cylinder_definition(model, 'Axis_Z_500', 2.5, 500, blue, 16)
    add_cylinder_instance(model, ents, xdef, [-140, -130, 0], [1, 0, 0], 'X - door width', guides)
    add_cylinder_instance(model, ents, ydef, [-140, -130, 0], [0, 1, 0], 'Y - frame depth', guides)
    add_cylinder_instance(model, ents, zdef, [-140, -130, 0], [0, 0, 1], 'Z - height', guides)
  end

  def build
    Dir.mkdir(OUT_DIR) unless Dir.exist?(OUT_DIR)
    error_path = File.join(OUT_DIR, 'build_error.txt')
    File.delete(error_path) if File.exist?(error_path)
    model = Sketchup.active_model
    model.start_operation('Build Alumex 100mm single door', true)
    model.entities.clear!
    model.definitions.purge_unused
    model.materials.purge_unused
    model.layers.purge_unused
    model.options['UnitsOptions']['LengthUnit'] = 2 # millimetres
    model.options['UnitsOptions']['LengthPrecision'] = 1

    aluminium = material(model, 'Powder-coated aluminium', [188, 196, 202])
    aluminium_dark = material(model, 'Aluminium edge', [116, 126, 135])
    steel = material(model, 'Stainless steel', [173, 178, 184])
    dark = material(model, 'Hardware dark', [49, 54, 60])
    rubber = material(model, 'EPDM rubber', [24, 28, 31])
    glass = material(model, 'Clear safety glass', [132, 208, 226], 0.36)
    red = material(model, 'Axis X', [210, 45, 45])
    green = material(model, 'Axis Y', [45, 165, 75])
    blue = material(model, 'Axis Z', [45, 90, 210])

    ents = model.entities
    frame_tag = tag(model, '00_OUTER_FRAME')
    leaf_tag = tag(model, '01_DOOR_LEAF')
    hardware_tag = tag(model, '03_HARDWARE')
    fastener_tag = tag(model, '04_FASTENERS')
    tag(model, '02_GLAZING')
    tag(model, '02_GLAZING_BEADS')

    # Outer frame: DXF-X maps to world-Y (depth), DXF-Y maps to the visible
    # frame face, and the extrusion axis follows the member length.
    place_profile(model, ents, '100D-3105', DOOR_H, [0, 0, 0], [0, 1, 0], [1, 0, 0], [0, 0, 1], aluminium, 'Left jamb 100D-3105', '00_OUTER_FRAME')
    place_profile(model, ents, '100D-3105', DOOR_H, [DOOR_W, 0, 0], [0, 1, 0], [-1, 0, 0], [0, 0, 1], aluminium, 'Right jamb 100D-3105 mirrored', '00_OUTER_FRAME')
    place_profile(model, ents, '100D-3105', DOOR_W, [0, 0, DOOR_H], [0, 1, 0], [0, 0, -1], [1, 0, 0], aluminium, 'Head 100D-3105 rotated', '00_OUTER_FRAME')

    # Closed single leaf. Hinge-side 100D-101 and lock-side 100D-103 follow
    # the catalogue B-B section; rails follow A-A.
    leaf_h = LEAF_TOP - LEAF_BOTTOM
    rail_len = (LEAF_RIGHT - STILE_FACE) - (LEAF_LEFT + STILE_FACE)
    rail_x = LEAF_LEFT + STILE_FACE
    place_profile(model, ents, '100D-101', leaf_h, [LEAF_LEFT, 18, LEAF_BOTTOM], [0, 1, 0], [1, 0, 0], [0, 0, 1], aluminium, 'Hinge stile 100D-101', '01_DOOR_LEAF')
    place_profile(model, ents, '100D-103', leaf_h, [LEAF_RIGHT, 18, LEAF_BOTTOM], [0, 1, 0], [-1, 0, 0], [0, 0, 1], aluminium, 'Lock stile 100D-103 mirrored', '01_DOOR_LEAF')
    place_profile(model, ents, '100D-401', rail_len, [rail_x, 8, LEAF_BOTTOM], [0, 1, 0], [0, 0, 1], [1, 0, 0], aluminium, 'Bottom rail 100D-401', '01_DOOR_LEAF')
    place_profile(model, ents, '100D-301', rail_len, [rail_x, 18, 1010], [0, 1, 0], [0, 0, 1], [1, 0, 0], aluminium, 'Mid rail 100D-301', '01_DOOR_LEAF')
    place_profile(model, ents, '100D-201', rail_len, [rail_x, 28, LEAF_TOP - 42.2], [0, 1, 0], [0, 0, 1], [1, 0, 0], aluminium, 'Top rail 100D-201', '01_DOOR_LEAF')

    add_glazing_set(model, ents, glass, rubber, aluminium_dark, 101, 899, 68, 1004, 'Lower lite')
    add_glazing_set(model, ents, glass, rubber, aluminium_dark, 101, 899, 1058, 2000, 'Upper lite')

    # Three 100 mm butt hinges at bottom/mid/top. The hinge pin is vertical;
    # leaves lie in the X-Z plane at the front face, matching catalogue p.23.
    hinge = hinge_definition(model, aluminium, steel, dark)
    rivet = screw_definition(model, 'CSK_Pop_Rivet_D4_L16', 4, 16, 8, 2, steel)
    [360, 1040, 1720].each_with_index do |hz, index|
      inst = ents.add_instance(hinge, Geom::Transformation.translation(pt(49, 13, hz)))
      inst.name = "Butt hinge #{index + 1}"
      inst.layer = hardware_tag
      [-17, 17].each do |dx|
        [-30, 30].each do |dz|
          add_cylinder_instance(model, ents, rivet, [49 + dx, 11.5, hz + dz], [0, 1, 0], "H#{index + 1} CSK rivet frame", fastener_tag)
          add_cylinder_instance(model, ents, rivet, [49 + dx + 28, 11.5, hz + dz], [0, 1, 0], "H#{index + 1} CSK rivet door", fastener_tag)
        end
      end
    end

    # Wall anchors: four per jamb and three through the head.
    anchor = screw_definition(model, 'Frame_Anchor_D7_L80', 7, 80, 12, 4, steel)
    [280, 760, 1340, 1820].each_with_index do |z, i|
      add_cylinder_instance(model, ents, anchor, [22, 55, z], [-1, 0, 0], "Left frame anchor #{i + 1}", fastener_tag)
      add_cylinder_instance(model, ents, anchor, [978, 55, z], [1, 0, 0], "Right frame anchor #{i + 1}", fastener_tag)
    end
    [250, 500, 750].each_with_index do |x, i|
      add_cylinder_instance(model, ents, anchor, [x, 55, 2078], [0, 0, 1], "Head frame anchor #{i + 1}", fastener_tag)
    end

    # Two threaded tie rods per horizontal rail, with nuts at both stiles.
    rod = cylinder_definition(model, 'Threaded_Rod_M6_L850', 3, 850, steel, 16)
    nut = cylinder_definition(model, 'M6_Nut', 5.5, 5, dark, 6)
    [41, 1031, 2027].each_with_index do |z, rail_i|
      [34, 70].each_with_index do |y, row_i|
        add_cylinder_instance(model, ents, rod, [74, y, z], [1, 0, 0], "Rail #{rail_i + 1} tie rod #{row_i + 1}", fastener_tag)
        add_cylinder_instance(model, ents, nut, [69, y, z], [1, 0, 0], "Rail #{rail_i + 1} left nut #{row_i + 1}", fastener_tag)
        add_cylinder_instance(model, ents, nut, [924, y, z], [1, 0, 0], "Rail #{rail_i + 1} right nut #{row_i + 1}", fastener_tag)
      end
    end

    add_handle_set(model, ents, steel, dark)
    handle_screw = screw_definition(model, 'Handle_Screw_M5_L35', 5, 35, 9, 3, steel)
    [1003, 1043].each do |z|
      add_cylinder_instance(model, ents, handle_screw, [922, 27, z], [0, 1, 0], 'Handle fixing screw front', fastener_tag)
      add_cylinder_instance(model, ents, handle_screw, [922, 67, z], [0, -1, 0], 'Handle fixing screw back', fastener_tag)
    end

    # Threshold strip and five countersunk anchors.
    add_box(ents, [0, 3, 0], [DOOR_W, 94, 4], aluminium_dark, 'TH-002 threshold strip (schematic extrusion)', frame_tag)
    threshold_screw = screw_definition(model, 'Threshold_Screw_D6_L45', 6, 45, 11, 3, steel)
    [100, 300, 500, 700, 900].each_with_index do |x, i|
      add_cylinder_instance(model, ents, threshold_screw, [x, 50, 4], [0, 0, -1], "Threshold anchor #{i + 1}", fastener_tag)
    end

    add_orientation_axes(model, ents, red, green, blue)

    model.set_attribute('Alumex', 'system', '100mm Door (1.6mm thickness)')
    model.set_attribute('Alumex', 'configuration', 'Single leaf, butt hinge, two glazed lites')
    model.set_attribute('Alumex', 'overall_width_mm', DOOR_W)
    model.set_attribute('Alumex', 'overall_height_mm', DOOR_H)
    model.set_attribute('Alumex', 'catalogue_reference', 'Advance Profile Book Group 08 pages 02, 03, 09 and 10')
    model.set_attribute('Alumex', 'orientation', 'World X=width, Y=depth, Z=height; exterior/front is negative Y')

    model.commit_operation
    model.active_view.camera = Sketchup::Camera.new(pt(1500, -2450, 1650), pt(500, 40, 1030), vec(0, 0, 1), true)
    model.active_view.zoom_extents
    model.pages.add('Exterior Isometric')
    model.active_view.camera = Sketchup::Camera.new(pt(500, -3000, 1050), pt(500, 40, 1050), vec(0, 0, 1), true)
    model.active_view.zoom_extents
    model.pages.add('Exterior Elevation')
    model.active_view.camera = Sketchup::Camera.new(pt(1500, -2450, 1650), pt(500, 40, 1030), vec(0, 0, 1), true)
    model.active_view.zoom_extents
    model.pages.selected_page = model.pages['Exterior Isometric']
    saved = model.save(SKP_PATH)
    raise "SketchUp did not save #{SKP_PATH}" unless saved
    model.active_view.write_image(filename: PNG_PATH, width: 1800, height: 1800, antialias: true, transparent: false)
    File.write(File.join(OUT_DIR, 'build_complete.txt'), "Created #{SKP_PATH}\nPreview #{PNG_PATH}\nSketchUp remains open intentionally.\n")
    UI.messagebox("Alumex door created successfully.\n\nSaved to:\n#{SKP_PATH}\n\nSketchUp will remain open.")
  rescue => e
    model.abort_operation if model
    File.write(File.join(OUT_DIR, 'build_error.txt'), "#{e.class}: #{e.message}\n#{e.backtrace.join("\n")}") rescue nil
    UI.messagebox("Alumex door build failed. See output/sketchup/build_error.txt\n\n#{e.class}: #{e.message}")
  end
end

AlumexSingleDoor.build
