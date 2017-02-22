
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

var INSTS = ["DATA", "LDAI", "LDBI", "STAI", "BRB", "OPR", "LDAM", "LDBM", "STAM", "LDAC", "LDBC", "BR", "BRZ", "BRN", "LDAP"];

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


var reportError = function () {}

function assemble(assembly, errorFunction) {
  reportError = errorFunction;
  assembly_tokens = convertToTokens(assembly);
  console.log(assembly_tokens);
  //throw "don't do the rest yet";
  insts = convertToList(assembly_tokens);
  console.log(insts);
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
  insts = scanLabels(labelpos, insts);
  //interatively examine each jump to check if it can reach.
  var running = true;
  while(running) {
    running = false;
    insts = rescanLabels(labelpos, insts);
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
      for (var lencount = 0; lencount < inst.len; lencount++) {
        m_insts.push({inst: "PADDING"});
      }
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

  return m_insts;

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
  var new_insts = [];
  for (var i in insts) {
    var inst = insts[i]
    for (var j in inst.labels) {
      if (inst.labels[j].forcedAddresString == null) {
        labelpos.set(inst.labels[j].labelString, count);
      } else {
        var addr = parseInt(inst.labels[j].forcedAddresString)*2;
        if (addr < count) {
          if(insts[i-1].inst == "PADDING" && insts[i-1].len >= count - addr) {
            insts[i-1].len -= count - addr;
            count = addr;
          } else {
            reportError("Specified address for label "+inst.labels[j].labelString+" is too small so would overwrite existing code."); assert(false);
          }
        }
        if (addr > count) {
          new_insts.push({inst: "PADDING", len: addr-count});
          count = addr;
        }
        labelpos.set(inst.labels[j].labelString, count);
      }
    }
    new_insts.push(inst);
    count += inst.len;
  }
  return new_insts;
}


function scanLabels(labelpos, insts) {
  var count = 0;
  var new_insts = [];
  for (var i in insts) {
    var inst = insts[i]
    for (var j in inst.labels) {
      if (inst.labels[j].forcedAddresString == null || inst.labels[j].forcedAddresString == "") {
        labelpos.set(inst.labels[j].labelString, count);
      } else {
        var addr = parseInt(inst.labels[j].forcedAddresString)*2;
        if( isNaN(addr)) {reportError("Address for label: "+ inst.labels[j].labelString + " is not valid. (only decimal or hex addr allowed)");assert(false);}
        if ( inst.inst == "DATA" && addr%2 == 1) {reportError("DATA region cannot be set to "+ addr + ", since it not word aligned. (not a multiple of 2)");assert(false);}
        if (addr < count) {reportError("Specified address for label "+inst.labels[j].labelString+" is too small so would overwrite existing code."); assert(false); }
        if (addr > count) {
          new_insts.push({inst: "PADDING", len: addr-count});
          count = addr;
        }
        labelpos.set(inst.labels[j].labelString, count);
      }
    }
    new_insts.push(inst);
    count += inst.len;
  }
  return new_insts;
}

function convertToTokens(assembly)
{
  var tokens = [];
  var line = 1;
  var i = 0;
  while (i < assembly.length)
  {
    var ch = assembly[i];
    if (ch == '\n') {
      console.log("newline");
      tokens.push(ch);
      i++;
      ch = assembly[i];
      line++;
    } else if (ch == '#') {
      console.log("comment");
      i++;
      ch = assembly[i];
      while( ch != '\n' ) {
        i++;
        ch = assembly[i];
      }
    } else {
      console.log("else '" + ch + "'");
      //throw away leading spaces
      while (ch == ' ') { i++; ch = assembly[i]; }
      //deal with lines with just spaces
      if(ch == '\n') {
        tokens.push(ch);
        continue;
      }

      token = "";
      while(!/[^a-zA-Z0-9_-]/.test(ch)) {
        token += ch;
        i++;
        ch = assembly[i];
      }
      tokens.push(token);
      while (ch == ' ') { i++; ch = assembly[i]; }
      while(/[^a-zA-Z0-9_-]/.test(ch) && ch != ' ' && ch != '\n') {
        tokens.push(ch);
        i++;
        ch = assembly[i];
      }
      while (ch == ' ') { i++; ch = assembly[i]; }
    }
  }
  return tokens;
}

function convertToList(assembly) {
  var insts = [];
  var line = 1;
  var i = 0;
  var current_inst = {};
  current_inst.labels = [];
  while (i < assembly.length) {

    if(assembly[i] == "\n")
    {
      line++;
      i++;
    }
    else if(i + 1 < assembly.length && assembly[i+1] == ":")
    {
      current_inst.labels.push( {line: line, labelString: assembly[i] , forcedAddresString: ""} );
      i+=2;
    }
    else if(i + 4 < assembly.length && assembly[i+1] == "[" && assembly[i+3] == "]" && assembly[i+4] == ":")
    {
      current_inst.labels.push( {line: line, labelString: assembly[i] , forcedAddresString: assembly[i+2] } );
      i+=5;
    }
    else if(i + 2 < assembly.length && INSTS.indexOf(assembly[i]) != -1 && assembly[i+2] == "\n")
    {
      current_inst.line = line;
      current_inst.inst = assembly[i];
      current_inst.opr = assembly[i+1];
      insts.push(current_inst);
      current_inst = {};
      current_inst.labels = [];
      i+=2;
    }
    else if(i + 2 < assembly.length && INSTS.indexOf(assembly[i]) != -1 && assembly[i+2] == "\n")
    {
      reportError("Error on line "+line+", Instruction does not end with a new line."); assert(false);
    }
    else
    {
      reportError("Error on line "+line+", bad label or instruction format."); assert(false);
    }
  }
  if(current_inst.labels.length != 0)
  {
    reportError("Error on line "+line+", label without an instruction."); assert(false);
  }
  return insts;
}
