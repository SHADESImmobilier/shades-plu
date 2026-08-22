-- ============================================================================
-- seed.sql — données de DÉMO (dev/local uniquement)
-- ----------------------------------------------------------------------------
-- Exécuté par `supabase db reset` sur une base FRAÎCHE. NE PAS utiliser en prod :
-- les vraies associations et vrais partenaires s'ajoutent via le back-office.
-- ============================================================================

-- Associations (tsedakot) — MitzvaNOW en premier (soutien au projet).
insert into tsedakot (name, description, category, is_platform, tax_receipt_eligible, accepts_donations, country)
values
  ('MitzvaNOW',       'Soutenir le développement du projet', 'plateforme', true,  false, true, 'FR'),
  ('Colel Habad',     'Aide aux familles dans le besoin',    'familles',   false, true,  true, 'FR'),
  ('Yéchiva locale',  'Soutien à l''étude de la Torah',      'etude',      false, true,  true, 'FR'),
  ('Hachnasat Kala',  'Aider les jeunes mariés',             'familles',   false, true,  true, 'FR'),
  ('Bikour Holim',    'Visite et soutien aux malades',       'malades',    false, true,  true, 'FR')
on conflict do nothing;

-- Partenaires + offres (échange de points contre des bons cachers).
with p as (
  insert into partners (name, category, city) values
    ('Hyper Cacher',             'supermarche', 'Paris'),
    ('Restaurant Chez Yaacov',   'restaurant',  'Paris'),
    ('Boucherie Cachère du Roi', 'boucherie',   'Paris'),
    ('Librairie Sinaï',          'librairie',   'Paris'),
    ('Épicerie Cachère Cohen',   'epicerie',    'Paris'),
    ('Sofer STaM David',         'sofer',       'Paris')
  returning id, name
)
insert into partner_offers (partner_id, title, description, cost_points)
select p.id, o.title, o.descr, o.cost
from p join (values
  ('Hyper Cacher',             'Bon d''achat 10 €',     'Supermarché cacher',        500),
  ('Hyper Cacher',             'Bon d''achat 25 €',     'Supermarché cacher',       1200),
  ('Restaurant Chez Yaacov',   '-20 % sur l''addition', 'Restaurant cacher',         600),
  ('Boucherie Cachère du Roi', 'Bon d''achat 15 €',     'Viande cachère',            750),
  ('Librairie Sinaï',          'Bon d''achat 10 €',     'Livres & judaïca',          500),
  ('Épicerie Cachère Cohen',   '-15 % en caisse',       'Sur tout le magasin',       800),
  ('Sofer STaM David',         'Vérification tefillin', 'Contrôle des parchemins',  1200)
) as o(pname, title, descr, cost) on o.pname = p.name;
