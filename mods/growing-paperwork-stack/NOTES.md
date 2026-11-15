# Growing paperwork stack

- Every 45 seconds of typing at the desk adds a bundle of pages to a tower at the left end
  of the desk (`desk-active` fires every 15 s; the `ticks` count shows one bundle per 3).
- Eight bundles (6 minutes) make a tower taller than him. At 26 ticks (about 6.5 minutes)
  loose pages rain down over him (`rain` prop, shown for 2.6 s), he huffs in his seat for
  2.5 seconds while the pages land and says "Damn it! Work never ends". `cycle: 26` empties the pile
  and it starts again.
- The pile follows the saved count, so it is still there after a restart.
- Lines and the huff are his own (this mod was built for ToshiToshi).
