
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

function assembler_wrapper() {
    clearError();
    var assembly = $("#assembly_editor").val()+"\n";
    m_insts = assemble(assembly, reportError);

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
    $("#assemble").click(assembler_wrapper);

    $("#messages").hide();
    $("#clearmessage").click(function() {$("#messages").hide()});
});
