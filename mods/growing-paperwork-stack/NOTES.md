# Growing paperwork stack

- One saved counter, `sheets`, goes up on each finished desk session (`desk-done`).
- At sheets 3, 6 and 9 he says one line with the count, and a small paper pile appears on the desk.
- Limitation: the API gives one prop per action and only one behavior per counter name, so
  the pile does not visibly grow past its first size at 6 and 9. Only the lines change.
- The pile is shown from the 3rd sheet on; it is not hidden again within a session.
- Not used: a long-session trigger (already on the idea list), sounds at the desk, and any stamping.
