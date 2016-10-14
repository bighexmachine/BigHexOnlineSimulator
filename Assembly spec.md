## Wallcomp Assembly Specification##

Designed to be very close to machine code with the assembler only really handling the layout of instructions and data in memory.
Also to make it simpler to write the assembler isn't that flexible in terms of syntax.

#Labels#

Labels go on their own line and label the next line which is an instruction.

They are written with no spaces before,
then an 'L',
then an identifier not containing spaces,
then a new line

You can define more than one label on consecutive lines and they will be given the same value.

#Instructions#

All instructions like the machine's instructions have 1 operand.

Instructions are written with at least one space at the start of the line,
then the acronym,
then at least one more space,
then the operand,
then a new line (with no trailing spaces).

Eg:
 BR 1
or
 OPR ADD

The instructions are as follows taken from the machine code specification.

LDAM: areg ← mem[oreg] load from memory
LDBM: breg ← mem[oreg] load from memory
STAM: mem[oreg] ← areg store to memory

Access to constants and program addresses is provided by instructions which either
load values directly or enable them to be loaded from a location in the program:
LDAC: areg ← oreg load constant
LDBC: breg ← oreg load constant
LDAP: areg ← pc + oreg load address in program

Access to data structures is provided by instructions which combine an address
with an offset:
LDAI: areg ← mem[areg + oreg] load from memory
LDBI: breg ← mem[breg + oreg] load from memory
STAI: mem[breg + oreg] ← areg store to memory

Branching, jumping and calling
The branch instructions include conditional and unconditional relative branches.
A branch using an offset in the stack is provided to support jump tables.
BR: pc ← pc + oreg branch relative unconditional
BRZ: if areg = 0 then pc ← pc + oreg branch relative zero
BRN: if areg < 0 then pc ← pc + oreg branch relative negative
BRB: pc ← breg branch absolute

----

Slightly differently, to define a data word to be stored to memory.
DATA {16 bit number written in base 10}

It is suggested you label this word with a label and refer to it using that since the assembler might move it (for example to align it to fit in 1 16 bit word).

#Using labels as Operands for Instructions#

There are some instructions which use labels as operands.

LDAM, LDBM, STAM, LDAC, LDBC, BR, BRZ, BRN, LDAP

To use the label, instead of writing a number type 'L' and then the identifier.

The first 5 follow the previous definitions with labels.

But BR, BRZ, BRN, LDAP do a little extra. As you would expect the assembler calculates the relative jump to the specified label and uses that in the machine code.

#Notes#

The assembler doesn't like trailing white-space.
