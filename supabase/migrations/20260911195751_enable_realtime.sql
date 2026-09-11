-- Ninguna tabla nueva se agrega automaticamente a la publicacion de
-- Realtime al crearla; sin esto, la suscripcion postgres_changes del
-- cliente (lista de compras compartida en tiempo real) nunca recibe
-- eventos, aunque el canal se conecte sin error. La autorizacion de
-- postgres_changes respeta la RLS de la tabla con el JWT de quien se
-- suscribe, asi que sigue sin poder ver cambios de otro hogar.
alter publication supabase_realtime add table shopping_list_items;
