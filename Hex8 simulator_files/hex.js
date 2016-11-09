
var sizeOfMem = 0x800;

function assert(a) {
    if (!a) {
        throw "Assertion failed";
    }
}

function is_16bit(b) {
    if (b == undefined) { return false; }
    if (b != parseInt(b, 10)) { return false; }
    return (b >= 0 && b <= 0xFFFF);
}

function is_byte(b) {
    if (b == undefined) { return false; }
    if (b != parseInt(b, 10)) { return false; }
    return (b >= 0 && b <= 0xFF);
}

var HEX = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'B', 'C', 'D', 'E', 'F'];


function hex_byte(i) {
    if (is_byte(i) == false){
      throw i + " is not 8 bit number";
    }
    return HEX[i >> 4] + HEX[i % 16];
}

function hex_16bit(i) {
    if (is_16bit(i) == false){
      throw i + " is not 16 bit number";
    }
    return HEX[(i>>12)%16] + HEX[(i>>8)%16] + HEX[(i>>4)%16] + HEX[i % 16];
}

/* data mdoel */

var model = {
    memory : [],
    registers: { a: 0, b: 0, p: 0, o: 0 },
    running: 0
};

function init_model(m) {
    m.running = 0;
    m.registers.a = 0;
    m.registers.b = 0;
    m.registers.p = 0;
    m.registers.o = 0;
    for (var i = 0; i < sizeOfMem; i++) {
        m.memory[i] = 0;
    }
}

/* model observers */

var reg_observers = [];
var mem_observers = [];

var bps = [];

// read or write a register. Write fires off a changed event.
function reg(n, v) {

    if (v == undefined) {
        // read
        return model.registers[n];
    } else {
        // write
        v = v % 0x10000
        if (v < 0) { v += 0x10000; }
        model.registers[n] = v;
        for (var i = 0; i < reg_observers.length; i++) {
            (reg_observers[i])(n, v);
        }
    }
}

function ra(v) { return reg("a", v); }
function rb(v) { return reg("b", v); }
function rp(v) { return reg("p", v); }
function ro(v) { return reg("o", v); }

// read or write memory. Triggers observer events.
function mem(addr, v) {
    assert(is_16bit(addr));
    if (v == undefined) {
        var w = model.memory[addr];
        for (var i = 0; i < mem_observers.length; i++) {
            (mem_observers[i])("r", addr, w);
        }
        return w;
    } else {
        assert(is_16bit(v));
        var old = model.memory[addr];
        model.memory[addr] = v;
        for (var i = 0; i < mem_observers.length; i++) {
            (mem_observers[i])("w", addr, old, v);
        }
        return v;
    }
}

// read memory without triggering events.
function mem2(addr) {
    assert(is_16bit(addr));
    return model.memory[addr];
}

// Update entire memory from buffer.
function mem_update(buf) {
    assert(buf.length <= 0x8000);
    for (var index = 0; index < buf.length; index++) {
        model.memory[index] = buf[index];
    }
    for (var index = buf.length; index < 0x8000; index++) {
        model.memory[index] = 0;
    }
    for (var index = 0; index < mem_observers.length; index++) {
        (mem_observers[index])("reload", buf.length);
    }
}

/* views */

// Update the control panel. Listens for register changes.
function update_control(n, v) {
    if (n == "run") {
        if (v) {
            // $("#reset").attr('disabled', true);
            $("#step").attr('disabled', false);
            $("#run").attr('disabled', false);
            $("#is_running").html("Running.");
        } else {
            // $("#reset").attr('disabled', false);
            $("#step").attr('disabled', true);
            $("#run").attr('disabled', true);
            $("#is_running").html("Not running.");
        }
    }
}

// messages
function clearError() {
    $("#messages_content").html("");
    $("#messages").hide();
}

function reportError(e) {
    $("#messages_content").html(e);
    $("#messages").show();
}

// Called when the simulator has read or written memory or memory has reloaded.
// rw = "r" or "w" or "reload", addr is the memory address, for a read
// a is the value read, for a write a, b are the old and new values.
function update_mem_view(rw, addr, a, b) {
    $(".mem_cell").removeClass("r1");
    $(".mem_cell").removeClass("w1");

    var cellname = "#mem_" + (addr >> 4) + "_" + (addr % 16);
    if (rw == "r") {
        $(cellname).addClass("r1");
    } else if (rw == "w") {
        $(cellname).html(hex_16bit(mem2(addr)));
        $(cellname).addClass("w1");
    } else if (rw == "reload") {
        var rows = addr/16;
        for (var i = 0; i < rows; i++) {
            for (var j = 0; j < 16; j++) {
                var cell = $("#mem_" + i + "_" + j);
                cell.html(hex_16bit(mem2(16*i+j)));
            }
        }
    }
}

// Set up the disassembler view - create components and register the observer.
function init_disassembly_view() {
    var view = $("#disassembly");
    view.html("");

    var content = document.createElement("table");
    content.className = "dis_table";

    for (var i = 0; i < sizeOfMem; i++) {
        var row = document.createElement("tr");
        var heading = document.createElement("td");
        heading.className = "row_header";
        heading.innerHTML = hex_16bit(i);
        row.appendChild(heading);
        var cell = document.createElement("td");
        cell.id = "dis_h_" + i;
        cell.className = "mem_cell";
        var wholeWord = mem2(i>>1);
        if (i%2==1) {
          inst = (wholeWord >> 8) % 0xFF;
        } else {
          inst = wholeWord % 0xFF;
        }
        cell.innerHTML = hex_byte(inst);
        row.appendChild(cell);
        var disasm = document.createElement("td");
        disasm.id = "dis_d_" + i;
        disasm.className = "dis_cell";
        disasm.innerHTML = disassemble(inst);
        row.appendChild(disasm);
        var breakpoint = document.createElement("td");
        breakpoint.innerHTML = "<input type=\"checkbox\" id=\"dis_b_" + i +
            "\" />";
        row.appendChild(breakpoint);
        content.appendChild(row);
    }

    view.append(content);
    mem_observers.push(update_disassembly_view);
}

// Set up the memory view and register the observer.
function init_memory_view() {
    var view = $("#memory");
    view.html("");

    var content = document.createElement("table");
    content.className = "mem_table";
    var top_row = document.createElement("tr");
    top_row.appendChild(document.createElement("td"));
    for (var col = 0; col < 16; col++) {
        var h = document.createElement("td");
        h.className = "col_header";
        h.innerHTML = hex_byte(col);
        top_row.appendChild(h);
    }
    content.appendChild(top_row);
    for (var row = 0; row < sizeOfMem>>4; row++) {
        var theRow = document.createElement("tr");
        var row_header = document.createElement("td");
        row_header.className = "row_header";
        row_header.innerHTML = hex_16bit(row << 4);
        theRow.appendChild(row_header);
        for (var col = 0; col < 16; col++) {
            var theCell = document.createElement("td");
            theCell.id = "mem_" + row + "_" + col;
            theCell.className = "mem_cell";
            theCell.innerHTML = hex_16bit(mem2(0x10*row + col));
            theRow.appendChild(theCell);
        }
        content.appendChild(theRow);
    }
    view.append(content);

    mem_observers.push(update_mem_view);
}

// update the register view. n=name, v=value
function update_registers(n, v) {
    if(n == "a")       { $("#areg").html(hex_16bit(v)); }
    else if (n == "b") { $("#breg").html(hex_16bit(v)); }
    else if (n == "p") { $("#preg").html(hex_16bit(v)); }
    else if (n == "o") { $("#oreg").html(hex_16bit(v)); }
}

// update disassembly when a memory cell changes
function update_disassembly_view(rw, addr, a, b) {
    if (rw == "r") {
        // nothing to do
    } else if (rw == "w") {
        // update cells in 16bit region
        var addr_low = addr<<1;
        var val_low = b&0xFF;
        $("#dis_h_" + addr_low).html(hex_byte(val_low));
        $("#dis_d_" + addr_low).html(disassemble(val_low));
        var addr_hi = addr_low + 1;
        var val_hi = (b>>8)&0xFF;
        $("#dis_h_" + addr_hi).html(hex_byte(val_hi));
        $("#dis_d_" + addr_hi).html(disassemble(val_hi));
    } else if (rw == "reload") {
        // update all
        var insts = addr << 1;
        for (var i = 0; i < insts; i++) {
          var wholeWord = mem2(i>>1);
          var inst;
          if (i%2==1) {
            inst = (wholeWord >> 8) % 0x100;
          } else {
            inst = wholeWord % 0x100;
          }
          $("#dis_h_" + i).html(hex_byte(inst));
          $("#dis_d_" + i).html(disassemble(inst));
        }
    }
}

// Copy memory to editor and switch to it.
function switch_to_editor() {
    var memstring = "";
    for (var i = 0; i < sizeOfMem; i++) {
        var b = hex_16bit(mem2(i));
        memstring += b;
        memstring += " ";
        if ((i % 16 == 15)) {
            memstring += "\n";
        }
    }

    $("#memory_editor").val(memstring);
    $("#mainpage").hide();
    $("#editmem").show();
}

// Parse memory editor changes and accept if valid.
function memedit_accept() {
    clearError();
    var text = $("#memory_editor").val();
    var buf = [];
    var i = 0; // current index into buf
    var c = 0; // numberical value of current character
    var cur = ""; // current character

    var val = 0;
    var indexWithin = 0;

    for (var index = 0; index < text.length; index++) {
        var ch = text[index];

        if (ch == " " || ch == "\n") {
          if (indexWithin == 0) {
            continue;
          } else {
            reportError("Missplaced space at index " + i + ".");
          }
        } else {
          var x = HEX.indexOf(ch);
          if (x > -1) {
            val = (val << 4) + x;
            indexWithin++;
            if (indexWithin > 3) {
              buf[i] = val;
              i++;
              if (i > sizeOfMem) {
                  reportError("Overflow, max. 0x8000 bytes.");
                  return;
              }
              val = 0;
              indexWithin = 0;
            }
          } else {
              reportError("Wasn't expecting '" + ch + "' at index " + i + ".");
              return;
          }
        }
    }
    mem_update(buf);
    memedit_cancel();
    return;
}

// Cancel memory editor changes.
function memedit_cancel() {
    $("#mainpage").show();
    $("#editmem").hide();
}

function assemble() {
  clearError();
  var assembly = $("#assembly_editor").val()+"\n";
  insts = convertToList(assembly);

  //set up length of instructions with static length
  for (var i in insts) {
    var inst = insts[i];
    switch(inst.inst) {
      case "DATA":
        inst.len = 2;
        break;
      case "LDAI":
      case "LDBI":
      case "STAI":
      case "BRB":
        var num = parseInt(inst.opr);
        if(num < -256) {inst.len = 4;}
        else if (num < 0) {inst.len = 2;}
        else if (num < 0x10) {inst.len = 1;}
        else if (num < 0x100) {inst.len = 2;}
        else if (num < 0x1000) {inst.len = 2;}
        else if (num < 0x8000) {inst.len = 3;}
        else {reportError("Error with "+ inst.inst + " " + inst.opr+ ". Operand too large.");return;}
        break;
      case "OPR":
        inst.len = 1;
        break;
      case "LDAM":
      case "LDBM":
      case "STAM":
      case "LDAC":
      case "LDBC":
      case "BR":
      case "BRZ":
      case "BRN":
      case "LDAP":
        var num = parseInt(inst.opr)
        if (isNaN(num)) {
          inst.len = 1;
        } else {
          if(num < -256) {inst.len = 4;}
          else if (num < 0) {inst.len = 2;}
          else if (num < 0x10) {inst.len = 1;}
          else if (num < 0x100) {inst.len = 2;}
          else if (num < 0x1000) {inst.len = 2;}
          else if (num < 0x8000) {inst.len = 3;}
          else {reportError("Error with "+ inst.inst + " " + inst.opr+ ". Operand too large.");return;}
        }
        break;
    }
  }

  labelpos = new Map();
  //interatively examine each jump to check if it can reach.
  var running = true;
  while(running) {
    running = false;
    rescanLabels(labelpos, insts);
    var count = 0;
    for (var i in insts) {
      var inst = insts[i];
      if (inst.inst == "LDAM" || inst.inst == "LDBM" || inst.inst == "STAM" || inst.inst == "LDAC" || inst.inst == "LDBC" ||  inst.inst == "BR" || inst.inst == "BRZ" || inst.inst == "BRN" || inst.inst == "LDAP" ) {
        if ( isNaN(parseInt(inst.opr)) ){
          var dest = labelpos.get(inst.opr);
          if ( inst.inst == "LDAM" || inst.inst == "LDBM" || inst.inst == "STAM" || inst.inst == "LDAC" || inst.inst == "LDBC" ) {
            var opr_val = dest/2;
          } else {
            var opr_val = ( dest - (count+inst.len-1) ) - 1;
          }
          if (opr_val < -256) {
            if (inst.len != 4){
              inst.len = 4;
              running = true;
              break;
            }
          } else if (opr_val < 0) {
            if (inst.len != 2){
              inst.len = 2;
              running = true;
              break;
            }
          } else if (opr_val < 0x10) {
            if (inst.len != 1){
              inst.len = 1;
              running = true;
              break;
            }
          } else if (opr_val < 0x100) {
            if (inst.len != 2){
              inst.len = 2;
              running = true;
              break;
            }
          } else if (opr_val < 0x1000) {
            if (inst.len != 3){
              inst.len = 3;
              running = true;
              break;
            }
          } else if (opr_val < 0x8000) {
            if (inst.len != 4){
              inst.len = 4;
              running = true;
              break;
            }
          } else {
            reportError("Error with "+ inst.inst + " " + inst.opr+ ". Has to jump too far. Something probably went wrong.");
            running = false;
            break;
          }
        }
      } else if(inst.inst == "DATA") {
        //data needs to be in a 2 byte multiple so if it is not then padding is needed
        if(count % 2 != 0) {
          insts.splice(i, 0, {inst: "PADDING", len: 1})
          running = true;
          break;
        }
      }
      count += inst.len;
    }
  }

  m_insts = []
  //sub in jump values
  var count = 0;
  for (var i in insts) {
    var inst = insts[i];
    if (inst.inst == "DATA") {
      var val = parseInt(inst.opr);
      var m_inst_low = {inst: "DATA", opr: val&0xFF};
      var m_inst_hi = {inst: "DATA", opr: (val>>8)&0xFF};
      m_insts.push(m_inst_low);
      m_insts.push(m_inst_hi);
    } else if (inst.inst == "PADDING") {
      m_insts.push({inst: "PADDING"})
    } else {
      if (inst.inst == "OPR") {
        if (inst.opr == "ADD") {
          var opr_val = 0;
        } else if (inst.opr == "SUB") {
          var opr_val = 1;
        } else if (!isNaN(parseInt(inst.opr))) {
          var opr_val = parseInt(inst.opr);
        } else {
          reportError("Error with "+ inst.inst + " " + inst.opr+ ". Unsupported Operand for OPR. Try ADD, SUB or a number.");
          return;
        }
      } else if (inst.inst == "LDAM" || inst.inst == "LDBM" || inst.inst == "STAM" || inst.inst == "LDAC" || inst.inst == "LDBC" ||  inst.inst == "BR" || inst.inst == "BRZ" || inst.inst == "BRN" || inst.inst == "LDAP" ) {
        if ( isNaN(parseInt(inst.opr)) ){
          var dest = labelpos.get(inst.opr);
          if ( inst.inst == "LDAM" || inst.inst == "LDBM" || inst.inst == "STAM" || inst.inst == "LDAC" || inst.inst == "LDBC" ) {
            var opr_val = dest/2;
          } else {
            var opr_val = ( dest - (count+inst.len-1) ) - 1;
          }
        } else {
          var opr_val = parseInt(inst.opr);
        }
      } else {
        if ( isNaN(parseInt(inst.opr)) ){
          reportError("Error with "+ inst.inst + " " + inst.opr+ ". Operand should be a number.");
          return;
        } else {
          var opr_val = parseInt(inst.opr);
        }
      }
      if(opr_val < -0x8000) {
        reportError("Error with "+ inst.inst + " " + inst.opr+ ". Has to jump too far. Something probably went wrong.");
        return;
      } else if (opr_val < -256) {
        var m_inst_pfix1 = {inst: "PFIX", opr: ((opr_val>>12)&0xF)}
        var m_inst_pfix2 = {inst: "PFIX", opr: ((opr_val>>8)&0xF)}
        var m_inst_pfix3 = {inst: "PFIX", opr: ((opr_val>>4)&0xF)}
        var m_inst = {inst: inst.inst, opr: (opr_val&0xF)};
        m_insts.push(m_inst_pfix1);
        m_insts.push(m_inst_pfix2);
        m_insts.push(m_inst_pfix3);
        m_insts.push(m_inst);
      } else if (opr_val < 0) {
        var m_inst_nfix = {inst: "NFIX", opr: ((opr_val>>4)&0xF)};
        var m_inst = {inst: inst.inst, opr: (opr_val&0xF)};
        m_insts.push(m_inst_nfix);
        m_insts.push(m_inst);
      } else if (opr_val < 0x10) {
        var m_inst = {inst: inst.inst, opr: opr_val};
        m_insts.push(m_inst);
      } else if (opr_val < 0x100) {
        var m_inst_pfix = {inst: "PFIX", opr: ((opr_val>>4)&0xF)}
        var m_inst = {inst: inst.inst, opr: (opr_val&0xF)};
        m_insts.push(m_inst_pfix);
        m_insts.push(m_inst);
      } else if (opr_val < 0x1000) {
        var m_inst_pfix1 = {inst: "PFIX", opr: ((opr_val>>8)&0xF)}
        var m_inst_pfix2 = {inst: "PFIX", opr: ((opr_val>>4)&0xF)}
        var m_inst = {inst: inst.inst, opr: (opr_val&0xF)};
        m_insts.push(m_inst_pfix1);
        m_insts.push(m_inst_pfix2);
        m_insts.push(m_inst);
      } else if (opr_val < 0x8000) {
        var m_inst_pfix1 = {inst: "PFIX", opr: ((opr_val>>12)&0xF)}
        var m_inst_pfix2 = {inst: "PFIX", opr: ((opr_val>>8)&0xF)}
        var m_inst_pfix3 = {inst: "PFIX", opr: ((opr_val>>4)&0xF)}
        var m_inst = {inst: inst.inst, opr: (opr_val&0xF)};
        m_insts.push(m_inst_pfix1);
        m_insts.push(m_inst_pfix2);
        m_insts.push(m_inst_pfix3);
        m_insts.push(m_inst);
      } else {
        reportError("Error with "+ inst.inst + " " + inst.opr+ ". Has to jump too far. Something probably went wrong.");
        return;
      }
    }
    count += inst.len;
  }



  var memstring = "";
  var i;
  for (i = 0; i < m_insts.length-1; i += 2) {
    var m_inst_low = m_insts[i];
    var m_inst_hi = m_insts[i+1];
    var byte_low = getByteCode(m_inst_low);
    var byte_hi = getByteCode(m_inst_hi);
    var word = byte_low + (byte_hi<<8);
    memstring += hex_16bit(word);
    memstring += " ";
    if ((i % 32 == 31)) {
        memstring += "\n";
    }
  }
  var num_words = i>>1;
  if (m_insts.length % 2 == 1) {
    var m_inst_low = m_insts[i];
    var byte_low = getByteCode(m_inst_low);
    var word = byte_low;
    memstring += hex_16bit(word);
    memstring += " ";
    num_words++;
  }

  for (; num_words < sizeOfMem; num_words++){
    memstring += "0000 ";
    if ((num_words % 16 == 15)) {
        memstring += "\n";
    }
  }

  $("#memory_editor").val(memstring);

}

function getByteCode(inst) {
  switch(inst.inst) {
    case "PADDING":
      return 0;
      break;
    case "DATA":
      return inst.opr;
      break;
    case "LDAM":
      return (0<<4) + inst.opr;
      break;
    case "LDBM":
      return (1<<4) + inst.opr;
      break;
    case "STAM":
      return (2<<4) + inst.opr;
      break;
    case "LDAC":
      return (3<<4) + inst.opr;
      break;
    case "LDBC":
      return (4<<4) + inst.opr;
      break;
    case "LDAP":
      return (5<<4) + inst.opr;
        break;
    case "LDAI":
      return (6<<4) + inst.opr;
      break;
    case "LDBI":
      return (7<<4) + inst.opr;
      break;
    case "STAI":
      return (8<<4) + inst.opr;
      break;
    case "BR":
      return (9<<4) + inst.opr;
      break;
    case "BRZ":
      return (10<<4) + inst.opr;
      break;
    case "BRN":
      return (11<<4) + inst.opr;
      break;
    case "BRB":
      return (12<<4) + inst.opr;
      break;
    case "OPR":
      return (13<<4) + inst.opr;
      break;
    case "PFIX":
      return (14<<4) + inst.opr;
      break;
    case "NFIX":
      return (15<<4) + inst.opr;
      break;
  }
}

function rescanLabels(labelpos, insts) {
  var count = 0;
  for (var i in insts) {
    var inst = insts[i]
    for (var j in inst.labels) {
      labelpos.set(inst.labels[j], count);
    }
    count += inst.len;
  }
}

function convertToList(assembly) {
  var insts = [];
  var line = 0;
  var i = 0;
  while (i < assembly.length) {
    inst = {};
    var ch = assembly[i];
    if (ch == '\n') {
      i++;
      ch = assembly[i];
      line++;
    } else if (ch == '-') {
      i++;
      ch = assembly[i];
      while( ch != '\n' ) {
        i++;
        ch = assembly[i];
      }
      i++;
      ch = assembly[i];
      line++;
    } else if (ch == 'L') {

      inst.labels = [];
      while (ch == 'L') {
        var labelString = "";
        labelString += ch;
        i++;
        ch = assembly[i];
        while (ch != '\n') {
          if (ch == ' ') {reportError("Space in label (maybe at the end) on line "+ line +".");return null;}
          labelString += ch;
          i++;
          ch = assembly[i];
        }
        line++;
        i++;
        ch = assembly[i];
        inst.labels.push(labelString);
      }
      while ( ch == ' ') {
        i++;
        ch = assembly[i];
      }
      var instString = "";
      while( ch != ' ') {
        instString += ch;
        i++;
        ch = assembly[i];
      }
      inst.inst = instString;
      while ( ch == ' ') {
        i++;
        ch = assembly[i];
      }
      var oprString = "";
      while( ch != '\n' ) {
        oprString += ch;
        i++;
        ch = assembly[i];
      }
      if (oprString[0] == '0' && oprString[1] == 'x') {
        var tmp = parseInt(oprString);
        if (isNaN(tmp)) {reportError("Error on line "+ line +". "+oprString+" is not a number."); return null;}
        if (tmp >= 0x8000) {tmp = tmp - 0x10000;}
        oprString = String(tmp);
      }
      inst.opr = oprString;
      insts.push(inst);
      i++;
      line++;
    } else if (ch == ' ') {
      inst.labels = []
      i++;
      ch = assembly[i];
      while ( ch == ' ') {
        i++;
        ch = assembly[i];
      }
      var instString = "";
      while( ch != ' ') {
        instString += ch;
        i++;
        ch = assembly[i];
      }
      inst.inst = instString;
      while ( ch == ' ') {
        i++;
        ch = assembly[i];
      }
      var oprString = "";
      while( ch != '\n' ) {
        oprString += ch;
        i++;
        ch = assembly[i];
      }
      if (oprString[0] == '0' && oprString[1] == 'x') {
        var tmp = parseInt(oprString);
        if (isNaN(tmp)) {reportError("Error on line "+ line +". "+oprString+" is not a number."); return null;}
        if (tmp >= 0x8000) {tmp = tmp - 0x10000;}
        oprString = String(tmp);
      }
      inst.opr = oprString;
      insts.push(inst);
      i++;
      line++;
    } else {
      reportError("Error on line "+ line +".");
      return null;
    }
  }
  return insts;
}


// current delay.
function get_delay() {
    var delay = $("#delay").val();
    var d;
    if (delay == "10ms") { d = 10; }
    else if (delay == "20ms") { d = 20; }
    else if (delay == "50ms") { d = 50; }
    else if (delay == "100ms") { d = 100; }
    else if (delay == "200ms") { d = 200; }
    else if (delay == "500ms") { d = 500; }
    else { d = 1000; }
    return d;
}

// Hit when a register updates. If it's the pc and we're running, highlight
// the next instruction.
function update_disassembly_with_current_pc(n, v) {
    if (n == "p") {
        $("#disassembly").find('.dis_cell').removeClass('current_pc');
        $("#dis_d_" + v).addClass('current_pc');
        if ($("#disassembly").scrollTop() > v*24 || $("#disassembly").scrollTop() + $("#disassembly").height() < v*24) {
          $("#disassembly").scrollTop((v-1)*24);
        }
    } else if (n == "run") {
        if (v) {
            $("#dis_d_" + rp()).addClass('current_pc');
        } else {
            $("#disassembly").find('.dis_cell').removeClass('current_pc');
        }
    }

}

// return the current breakpoints.
function breakpoints() {
    for (var i = 0; i < 0x8000; i++) {
        if($("#dis_b_" + i).is(':checked')) {
            bps[i] = 1;
        } else {
          bps[i] = 0;
        }
    }
}

/* emulator */

var ISA = [
    { name: 'LDAM', opcode: 0, run: function() { ra(mem(ro())); ro(0); } },
    { name: 'LDBM', opcode: 1, run: function() { rb(mem(ro())); ro(0); } },
    { name: 'STAM', opcode: 2, run: function() { mem(ro(), ra()); ro(0); } },
    { name: 'LDAC', opcode: 3, run: function() { ra(ro()); ro(0); } },
    { name: 'LDBC', opcode: 4, run: function() { rb(ro()); ro(0); } },
    { name: 'LDAP', opcode: 5, run: function() { ra(rp()+ro()); ro(0); } },
    { name: 'LDAI', opcode: 6, run: function() { ra(mem(ra()+ro())); ro(0); } },
    { name: 'LDBI', opcode: 7, run: function() { rb(mem(rb()+ro())); ro(0); } },
    { name: 'STAI', opcode: 8, run: function() { mem(rb()+ro(),ra()); ro(0);} },
    { name: 'BR'  , opcode: 9, run: function() { rp(rp()+ro()); ro(0); }},
    { name: 'BRZ' , opcode:10, run: function() { if (ra()==0) {rp(rp()+ro());}
                                                 ro(0);} },
    { name: 'BRN' , opcode:11, run: function() { if (ra()>0x7FFF) {rp(rp()+ro());}
                                                 ro(0);} },
    { name: 'BRB' , opcode:12, run: function() { rp(rb()); ro(0); } },
    { name: 'OPR' , opcode:13, run: function() {  if (ro()==0) {
                                                    ra(ra()+rb()); ro(0);
                                                  } else if (ro()==1) {
                                                    ra(ra()-rb()); ro(0);
                                                  } else if (ro()==2) {

                                                  } else if (ro()==3) {

                                                  }
                                                }
    },
    { name: 'PFIX', opcode:15, run: function() { ro(ro() << 4); } },
    { name: 'NFIX' , opcode:14, run: function() {  ro( (15 << 12) + (15 << 8) + (ro() << 4) ); } }
];

function is_running() {
    return model.running;
}

function reset() {
    hlt();
    rp(0); ra(0); rb(0); ro(0);

}

// halt the simulation.
function hlt() {
    model.running = 0;
    $("#stop").attr('disabled', true);
    $("#run").attr('disabled', false);
    $("#step").attr('disabled', false);
}

function step() {

    var pc = rp();
    if (pc%2==0) {
        var inst = mem2(pc>>1) % 0x100;
    } else {
      var inst = (mem2(pc>>1) >> 8) % 0x100;
    }
    var opcode = (inst >> 4);
    var operand = inst % 16;
    var operation = ISA[opcode];

    ro((ro() & 0xFFF0) | operand);
    rp(rp() + 1);
    operation.run();
}

function disassemble(inst) {
    var opcode = inst >> 4;
    var opname = ISA[opcode].name;
    if (opname.length < 4) { opname += " " }
    if (opname.length < 4) { opname += " " }
    var operand = inst % 16;
    if (opcode == 13) {
      if(operand == 0) {
        return "OPR ADD";
      } else if(operand == 1) {
        return "OPR SUB";
      } else if(operand == 2) {
        return "OPR OUT";
      } else if(operand == 3) {
        return "OPR IN";
      }
    }
    return opname + "  " + HEX[operand];
}

function run() {
    if (is_running()) {
      step();
      if (bps[rp()]) {
          hlt();
          return;
      }
      setTimeout(run, get_delay());
    }
}

/* loader */

$(function(){
    init_model(model);

    init_disassembly_view();

    init_memory_view();

    $("#R").click(function(){
        clearError();
        var addr = $("#address").val();
        var value = $("#value").val();
        if (!is_byte(addr)) {
            reportError("Check your values.");
        } else {
            mem(addr);
        }
    });

    $("#W").click(function(){
        clearError();
        var addr = $("#address").val();
        var value = $("#value").val();
        if (!is_byte(addr) || !is_byte(value)) {
            reportError("Check your values.");
        } else {
            mem(addr, value);
        }
    });

    reg_observers.push(update_registers);
    reg_observers.push(update_disassembly_with_current_pc);

    reset();
    $("#reset").click(reset);
    $("#step").click(step);
    $("#run").click(
      function() {
        $("#run").attr('disabled', true );
        $("#step").attr('disabled', true);
        $("#stop").attr('disabled', false);
        model.running = 1;
        breakpoints();
        run();
      }
    );
    $("#stop").click(hlt);

    $("#load").click(switch_to_editor);
    $("#editmem").hide();

    $("#edityes").click(memedit_accept);
    $("#editno").click(memedit_cancel);
    $("#assemble").click(assemble);

    $("#messages").hide();
    $("#clearmessage").click(function() {$("#messages").hide()});
});
