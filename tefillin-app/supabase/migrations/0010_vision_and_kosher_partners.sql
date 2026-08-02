-- ============================================================================
-- 0010 · Support vision (photo de référence du poseur) + partenaires cachers
-- ============================================================================

-- Chemin Storage de la photo de référence du poseur (pour la comparaison faciale
-- par le modèle de vision, en plus de l'embedding).
alter table profiles
  add column if not exists face_ref_path text;

-- ---------------------------------------------------------------------------
-- Partenaires : bons de réduction (supermarchés/restos cachers, librairies…)
-- Les récompenses (points) s'échangent ici. Données de démo — à adapter.
-- ---------------------------------------------------------------------------
with p as (
  insert into partners (name, category, city) values
    ('Hyper Cacher',        'supermarche', 'Paris'),
    ('Restaurant Chez Yaacov','restaurant', 'Paris'),
    ('Boucherie Cachère du Roi','boucherie','Paris'),
    ('Librairie Sinaï',     'librairie',  'Paris')
  returning id, name
)
insert into partner_offers (partner_id, title, description, cost_points)
select p.id, o.title, o.descr, o.cost
from p join (values
  ('Hyper Cacher',            'Bon d''achat 10 €',   'Supermarché cacher',        500),
  ('Hyper Cacher',            'Bon d''achat 25 €',   'Supermarché cacher',       1200),
  ('Restaurant Chez Yaacov',  '-20 % sur l''addition','Restaurant cacher',        600),
  ('Boucherie Cachère du Roi','Bon d''achat 15 €',   'Viande cachère',            750),
  ('Librairie Sinaï',         'Bon d''achat 10 €',   'Livres & judaïca',          500)
) as o(pname, title, descr, cost) on o.pname = p.name;
