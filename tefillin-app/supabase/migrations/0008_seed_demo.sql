-- ============================================================================
-- 0008 · Données d'exemple (DÉMO) — associations & partenaires
-- ============================================================================
-- À adapter / retirer en production. Sert à peupler l'app pour la démo.
-- ============================================================================

-- Associations (tsedakot) — MitzvaNOW en premier (soutien au projet).
insert into tsedakot (name, description, category, is_platform, tax_receipt_eligible, accepts_donations, country)
values
  ('MitzvaNOW', 'Soutenir le développement du projet', 'plateforme', true,  false, true, 'FR'),
  ('Colel Habad', 'Aide aux familles dans le besoin',   'familles',   false, true,  true, 'FR'),
  ('Yéchiva locale', 'Soutien à l''étude de la Torah',   'etude',      false, true,  true, 'FR'),
  ('Hachnasat Kala', 'Aider les jeunes mariés',          'familles',   false, true,  true, 'FR'),
  ('Bikour Holim', 'Visite et soutien aux malades',      'malades',    false, true,  true, 'FR')
on conflict do nothing;

-- Partenaires + offres (échange de points).
with p as (
  insert into partners (name, category, city)
  values
    ('Librairie du Marais', 'librairie', 'Paris'),
    ('Épicerie Cachère Cohen', 'epicerie', 'Paris'),
    ('Sofer STaM David', 'sofer', 'Paris')
  returning id, name
)
insert into partner_offers (partner_id, title, description, cost_points)
select p.id, o.title, o.descr, o.cost
from p
join (values
  ('Librairie du Marais',      'Bon d''achat 10 €',  'Sefarim & judaïca',        500),
  ('Épicerie Cachère Cohen',   '-15 % en caisse',    'Sur tout le magasin',      800),
  ('Sofer STaM David',         'Vérification tefillin', 'Contrôle des parchemins', 1200)
) as o(pname, title, descr, cost) on o.pname = p.name;
