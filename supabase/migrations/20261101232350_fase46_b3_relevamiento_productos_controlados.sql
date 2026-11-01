-- Fase 46, b3: primer relevamiento. Se activa el control de vencimiento en 22
-- productos de baja rotación donde el vencimiento sí se olvida (enlatados y
-- conservas, salsas, untables, frutos secos, coco, harina leudante, polvo de
-- hornear, aceite de oliva premium, té, leche larga vida, crema de leche,
-- fritolín) y en Esponja de cocina (único vencimiento confirmado a mano por una
-- persona). Quedan afuera los de alta rotación (leche, huevos, quesos, pan,
-- masas, fideos, congelados) y todo lo que no es comestible.
update products set track_expiration = true
where not archived and name in (
  'Atún en lata', 'Choclo en lata', 'Extracto de tomate', 'Aceituna',
  'Reducción de aceto balsámico', 'Salsa de barbacoa', 'Ketchup', 'Mayonesa',
  'Salsa de soja', 'Dulce de leche', 'Mermelada', 'Pasta de maní', 'Maní',
  'Coco rallado', 'Harina leudante', 'Polvo de hornear', 'Aceite de oliva premium',
  'Té', 'Crema (de leche)', 'Leche larga vida', 'Fritolín',
  'Esponja de cocina'
);
