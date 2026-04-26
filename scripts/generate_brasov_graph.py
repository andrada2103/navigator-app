# backend/generate_brasov_graph.py

import osmnx as ox
import networkx as nx
import pickle
import json
from datetime import datetime
import time
import os
import random

class BrasovGraphGenerator:
    def __init__(self):
        self.graph = None
        self.start_time = None
        
    def log(self, message):
        """Afișează mesaj cu timestamp"""
        elapsed = time.time() - self.start_time if self.start_time else 0
        print(f"[{elapsed:.1f}s] {message}")
    
    def try_multiple_places(self):
        """Încearcă mai multe variante pentru municipiul Brașov"""
        
        places_to_try = [
            "Brașov, Romania",      # municipiul Brașov
            "Brasov, Romania",       # fără diacritice
            "Brașov",                # doar numele
        ]
        
        for place in places_to_try:
            self.log(f"🔍 Încerc: {place}")
            try:
                # Încercăm să obținem geometria
                gdf = ox.geocode_to_gdf(place)
                if not gdf.empty:
                    self.log(f"Găsit! Tip: {gdf.geometry.iloc[0].geom_type}")
                    return place
            except:
                continue
        
        return None
    
    def generate_graph(self, place=None):
        """Generează graful rutier pentru toate modurile de transport"""
        self.start_time = time.time()
        
        print("=" * 60)
        print("🚀 GENERARE GRAF RUTIER - BRAȘOV")
        print("=" * 60)
        
        # Dacă nu s-a specificat un loc, încearcă să găsești unul
        if place is None:
            place = self.try_multiple_places()
            if place is None:
                self.log("Nu s-a putut găsi locația")
                self.log("Folosim 'Brașov, Romania'")
                place = "Brașov, Romania"
        
        self.log(f"Se încarcă: {place}")
        
        try:
            # Încărcare graf fără filtrul restrictiv - inclusiv trotuare, piste, zone pietonale
            self.log("Se încarcă graful (inclusiv trotuare, piste, zone pietonale)...")
            
            self.graph = ox.graph_from_place(
                place,
                network_type='all',  # 'all' include toate tipurile de drumuri
                simplify=True,
                retain_all=False
            )
            
            self.log(f"Graf încărcat cu succes!")
            self.log(f"   - Noduri: {len(self.graph.nodes):,}")
            self.log(f"   - Muchii: {len(self.graph.edges):,}")
            
            # Adaugă atribute pentru toate modurile de transport
            self._add_routing_attributes()
            
            # Statistici
            self._print_statistics()
            
            return self.graph
            
        except Exception as e:
            self.log(f"Eroare la încărcare: {e}")
            return None
    
    def _add_routing_attributes(self):
        """Adaugă costuri pentru diferiți algoritmi și tipuri de transport"""
        self.log("Se adaugă atribute pentru rutare...")
        
        # Tipuri de drumuri INTERZISE pentru mașină (definitiv)
        CAR_FORBIDDEN = {
            'pedestrian', 'footway', 'path', 'steps', 'cycleway',
            'bridleway', 'track', 'corridor', 'elevator'
        }
        
        # Tipuri de drumuri PERMISE pentru mașină (prioritate)
        CAR_PREFERRED = {
            'motorway', 'motorway_link', 'trunk', 'trunk_link',
            'primary', 'primary_link', 'secondary', 'secondary_link',
            'tertiary', 'tertiary_link', 'residential', 'living_street',
            'unclassified', 'service'
        }
        
        # Tipuri de drumuri interzise pentru bicicletă
        BIKE_FORBIDDEN = {'motorway', 'motorway_link', 'trunk', 'trunk_link'}
        
        # Tipuri preferate pentru bicicletă
        BIKE_PREFERRED = {'cycleway', 'living_street', 'residential', 'path', 'track'}
        
        # Tipuri preferate pentru pietoni
        WALKING_PREFERRED = {'pedestrian', 'footway', 'steps', 'living_street', 'path'}
        
        added = 0
        for u, v, key, data in self.graph.edges(keys=True, data=True):
            try:
                # Verifică dacă data e dict
                if not isinstance(data, dict):
                    continue
                    
                # Distanța în km
                length_m = data.get('length', 0)
                if isinstance(length_m, (list, tuple)):
                    length_m = length_m[0] if length_m else 0
                data['distance_km'] = float(length_m) / 1000 if length_m else 0
                
                # Tipul drumului
                highway = data.get('highway', 'secondary')
                if isinstance(highway, (list, tuple)):
                    highway = highway[0] if highway else 'secondary'
                
                # ===== 1. PENTRU MAȘINĂ =====
                # Verifică dacă e permis
                if highway in CAR_FORBIDDEN:
                    # Interzis total pentru mașină - cost infinit
                    data['car_allowed'] = False
                    data['time_min'] = float('inf')
                    data['weight_safe'] = float('inf')
                    data['distance_km_car'] = float('inf')
                else:
                    data['car_allowed'] = True
                    
                    # Viteza în funcție de tipul drumului
                    speed = self._get_speed(highway)
                    data['speed_kmh'] = speed
                    
                    # Timpul în minute pentru mașină
                    if speed > 0 and data['distance_km'] > 0:
                        data['time_min'] = (data['distance_km'] / speed) * 60
                    else:
                        data['time_min'] = float('inf')
                    
                    # Scor de siguranță
                    safety_score = self._get_safety_score(highway)
                    data['safety_score'] = safety_score
                    data['risk_factor'] = 11 - safety_score
                    
                    # Cost pentru rută sigură (timp × risc)
                    data['weight_safe'] = data['distance_km'] * (1 + (data['risk_factor'] * 0.15))
                
                # ===== 2. PENTRU MERS PE JOS =====
                # Factor de bază pentru mers
                walking_factor = 1.0
                highway_str = str(highway).lower()
                
                # Verifică dacă e accesibil pentru pietoni
                if highway in CAR_FORBIDDEN:  # trotuare, scări - PERFECT pentru pietoni
                    walking_factor = 0.4  # Bonus mare
                elif highway in ['residential', 'living_street', 'unclassified']:
                    walking_factor = 0.9  # Ușor bonus
                elif highway in ['tertiary', 'tertiary_link']:
                    walking_factor = 1.2  # Acceptabil
                elif highway in ['secondary', 'secondary_link']:
                    walking_factor = 2.0  # Mai puțin plăcut
                elif highway in ['primary', 'primary_link']:
                    walking_factor = 3.5  # Necorespunzător pentru pietoni
                elif highway in ['motorway', 'motorway_link', 'trunk', 'trunk_link']:
                    walking_factor = 100.0  # Interzis practic
                
                data['walking_cost'] = data['distance_km'] * walking_factor
                
                # ===== 3. PENTRU BICICLETĂ =====
                cycling_factor = 1.0
                
                # Verifică dacă e permis pentru bicicletă
                if highway in BIKE_FORBIDDEN:
                    # Interzis pe autostrăzi
                    cycling_factor = 100.0
                elif 'cycleway' in highway_str:
                    cycling_factor = 0.3  # Piste - bonus maxim
                elif highway in ['living_street', 'residential']:
                    cycling_factor = 0.6  # Străzi liniștite
                elif highway in ['path', 'track']:
                    cycling_factor = 0.8  # Poteci (bun pentru bicicletă)
                elif highway in ['tertiary', 'unclassified']:
                    cycling_factor = 1.0  # Normal
                elif highway in ['secondary']:
                    cycling_factor = 1.3  # Acceptabil
                elif highway in ['primary']:
                    cycling_factor = 2.0  # Mai puțin recomandat
                elif highway in ['pedestrian', 'footway', 'steps']:
                    cycling_factor = 2.5  # Zone pietonale - evită (dar nu imposibil)
                
                data['cycling_cost'] = data['distance_km'] * cycling_factor
                
                # ===== 4. Păstrăm costurile existente pentru compatibilitate =====
                data['weight_short'] = data['distance_km']
                data['weight_fast'] = data['time_min'] if data['car_allowed'] else float('inf')
                
                added += 1
                
            except Exception as e:
                # Ignorăm muchiile problematice
                continue
        
        self.log(f" Atribute adăugate pentru {added:,} muchii")
        self.log(f"   - walking_cost: pentru mers pe jos")
        self.log(f"   - cycling_cost: pentru bicicletă")
        self.log(f"   - distance_km/time_min/weight_safe: pentru mașină")
    
    def _get_speed(self, highway_type):
        """Viteza estimată pentru mașină (km/h)"""
        speeds = {
            'motorway': 100, 'motorway_link': 80,
            'trunk': 90, 'trunk_link': 70,
            'primary': 70, 'primary_link': 60,
            'secondary': 50, 'secondary_link': 40,
            'tertiary': 40, 'tertiary_link': 30,
            'residential': 30, 'unclassified': 30,
            'living_street': 15,
            'pedestrian': 5,    # Mașinile nu ar trebui să fie aici, dar punem o valoare mică
            'footway': 5,        # idem
            'path': 5,           # idem
            'cycleway': 15,      # uneori mașinile au acces limitat
            'steps': 1,          # scări - mașinile nu au ce căuta
        }
        return speeds.get(highway_type, 30)
    
    def _get_safety_score(self, highway_type):
        """Scor de siguranță 1-10 (10 = cel mai sigur)"""
        safety = {
            'motorway': 5, 'motorway_link': 6,
            'trunk': 5, 'trunk_link': 6,
            'primary': 6, 'primary_link': 7,
            'secondary': 7, 'secondary_link': 8,
            'tertiary': 8, 'tertiary_link': 8,
            'residential': 9, 'unclassified': 7,
            'living_street': 10,
            'pedestrian': 10,     # zone pietonale - foarte sigure
            'footway': 10,         # trotuare - foarte sigure
            'path': 9,             # poteci - sigure
            'cycleway': 9,         # piste - sigure
            'steps': 10,           # scări - sigure
        }
        return safety.get(highway_type, 6)
    
    def _print_statistics(self):
        """Afișează statistici detaliate"""
        print("\n" + "-" * 60)
        print("STATISTICI GRAF")
        print("-" * 60)
        
        # Tipuri de drumuri
        highway_types = {}
        total_length = 0
        
        for u, v, data in self.graph.edges(data=True):
            if isinstance(data, dict):
                hw = data.get('highway', 'unknown')
                if isinstance(hw, (list, tuple)):
                    hw = hw[0] if hw else 'unknown'
                highway_types[hw] = highway_types.get(hw, 0) + 1
                total_length += data.get('length', 0)
        
        print(f"Lungime totală rețea: {total_length/1000:.1f} km")
        print(f"Număr total muchii: {len(self.graph.edges):,}")
        print(f"Număr total noduri: {len(self.graph.nodes):,}")
        
        print("\nTipuri de drumuri incluse:")
        for hw, count in sorted(highway_types.items(), key=lambda x: x[1], reverse=True):
            print(f"  - {hw}: {count} segmente")
        
        print("-" * 60)
    
    def test_routing(self):
        """Testează rutarea pentru toate modurile de transport"""
        self.log("🧪 Se testează rutarea pentru toate modurile...")
        
        nodes = list(self.graph.nodes())
        if len(nodes) < 2:
            self.log(" Nu sunt suficiente noduri")
            return
        
        start = random.choice(nodes)
        end = random.choice(nodes)
        
        try:
            print("\n" + "=" * 60)
            print(" TEST RUTARE")
            print("=" * 60)
            
            # 1. Cel mai scurt drum (mașină - distanță)
            try:
                path_dist = nx.shortest_path(self.graph, start, end, weight='distance_km')
                dist_km = nx.shortest_path_length(self.graph, start, end, weight='distance_km')
                print(f" Mașină (scurt): {dist_km:.2f} km, {len(path_dist)} noduri")
            except:
                print(" Mașină (scurt): Nu există drum")
            
            # 2. Cel mai rapid drum (mașină - timp)
            try:
                path_time = nx.shortest_path(self.graph, start, end, weight='time_min')
                time_min = nx.shortest_path_length(self.graph, start, end, weight='time_min')
                print(f" Mașină (rapid): {time_min:.1f} min, {len(path_time)} noduri")
            except:
                print(" Mașină (rapid): Nu există drum")
            
            # 3. Cel mai sigur drum (mașină - siguranță)
            try:
                path_safe = nx.shortest_path(self.graph, start, end, weight='weight_safe')
                safe_cost = nx.shortest_path_length(self.graph, start, end, weight='weight_safe')
                print(f" Mașină (sigur): {safe_cost:.1f} cost, {len(path_safe)} noduri")
            except:
                print(" Mașină (sigur): Nu există drum")
            
            # 4. Mers pe jos
            try:
                path_walk = nx.shortest_path(self.graph, start, end, weight='walking_cost')
                walk_cost = nx.shortest_path_length(self.graph, start, end, weight='walking_cost')
                walk_km = nx.shortest_path_length(self.graph, start, end, weight='distance_km')
                print(f" Mers pe jos: {walk_km:.2f} km, cost {walk_cost:.2f}, {len(path_walk)} noduri")
            except:
                print(" Mers pe jos: Nu există drum")
            
            # 5. Bicicletă
            try:
                path_bike = nx.shortest_path(self.graph, start, end, weight='cycling_cost')
                bike_cost = nx.shortest_path_length(self.graph, start, end, weight='cycling_cost')
                bike_km = nx.shortest_path_length(self.graph, start, end, weight='distance_km')
                print(f" Bicicletă: {bike_km:.2f} km, cost {bike_cost:.2f}, {len(path_bike)} noduri")
            except:
                print(" Bicicletă: Nu există drum")
            
            print("=" * 60)
            
        except Exception as e:
            self.log(f" Eroare: {e}")
    
    def save_graph_safe(self, filename='brasov_graph_clean.pkl'):
        """Salvează graful într-un format sigur"""
        self.log(f" Se salvează în {filename}...")
        
        # Creează o copie curată a grafului
        graph_copy = nx.MultiDiGraph()
        
        # Adaugă nodurile
        for node, data in self.graph.nodes(data=True):
            # Curăță datele nodului
            clean_data = {}
            for k, v in data.items():
                if not isinstance(v, (list, dict, set)):
                    clean_data[k] = v
            graph_copy.add_node(node, **clean_data)
        
        # Adaugă muchiile
        for u, v, key, data in self.graph.edges(keys=True, data=True):
            if isinstance(data, dict):
                # Curăță datele muchiei
                clean_data = {}
                for k, val in data.items():
                    if not isinstance(val, (list, dict, set)):
                        clean_data[k] = val
                    elif k == 'geometry' and val:
                        # Păstrează geometria pentru afișare
                        try:
                            coords = list(val.coords)
                            if coords:
                                clean_data['geometry'] = val
                        except:
                            pass
                
                graph_copy.add_edge(u, v, key=key, **clean_data)
        
        # Salvează
        with open(filename, 'wb') as f:
            pickle.dump(graph_copy, f)
        
        file_size = os.path.getsize(filename) / (1024 * 1024)
        self.log(f" Salvat! Dimensiune: {file_size:.1f} MB")
        return graph_copy
    
    def export_for_frontend(self, filename='brasov_graph.json'):
        """Exportă o versiune simplificată pentru frontend"""
        self.log(f" Se exportă în {filename}...")
        
        nodes_list = []
        for node, data in self.graph.nodes(data=True):
            nodes_list.append({
                'id': node,
                'lat': float(data.get('y', 0)),
                'lng': float(data.get('x', 0))
            })
        
        edges_list = []
        for u, v, key, data in self.graph.edges(keys=True, data=True):
            if isinstance(data, dict):
                edge_data = {
                    'from': u,
                    'to': v,
                    'distance_km': float(data.get('distance_km', 0)),
                    'time_min': float(data.get('time_min', 0)) if data.get('time_min') != float('inf') else 999999,
                    'walking_cost': float(data.get('walking_cost', 0)),
                    'cycling_cost': float(data.get('cycling_cost', 0)),
                    'weight_safe': float(data.get('weight_safe', 0)) if data.get('weight_safe') != float('inf') else 999999,
                    'safety_score': int(data.get('safety_score', 5)),
                    'highway': str(data.get('highway', 'unknown')),
                    'name': str(data.get('name', '')),
                    'oneway': bool(data.get('oneway', False)),
                    'car_allowed': bool(data.get('car_allowed', True))
                }
                
                # ADAUGĂ GEOMETRIA reală a străzii
                if 'geometry' in data and data['geometry']:
                    try:
                        # Convertește geometria în listă de coordonate [lat, lng]
                        coords = list(data['geometry'].coords)
                        # Simplificăm pentru a reduce dimensiunea (păstrăm 1 din 3 puncte)
                        if len(coords) > 30:
                            step = max(1, len(coords) // 30)
                            coords = coords[::step]
                        edge_data['geometry'] = [[c[1], c[0]] for c in coords]  # [lat, lng] pentru Leaflet
                    except Exception as e:
                        pass
                
                edges_list.append(edge_data)
        
        output = {
            'nodes': nodes_list,
            'edges': edges_list,
            'metadata': {
                'place': 'Brașov',
                'generated': datetime.now().isoformat(),
                'nodes_count': len(nodes_list),
                'edges_count': len(edges_list),
                'transport_modes': ['driving', 'walking', 'cycling']
            }
        }
        
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(output, f, ensure_ascii=False, indent=2)
        
        file_size = os.path.getsize(filename) / (1024 * 1024)
        self.log(f" Exportat! Dimensiune: {file_size:.1f} MB")

# ===== EXECUȚIE =====
if __name__ == "__main__":
    print("=" * 60)
    print(" Generatorul de graf pentru Brașov")
    print("=" * 60)
    
    generator = BrasovGraphGenerator()
    
    # Încearcă să încarce
    graph = generator.generate_graph()
    
    if graph:
        # Testează rutarea pentru toate modurile
        generator.test_routing()
        
        # Salvează în format sigur
        generator.save_graph_safe('brasov_graph_clean.pkl')
        
        # Exportă pentru frontend
        generator.export_for_frontend('brasov_graph.json')
        
        print("\n" + "=" * 60)
        print(" GENERARE COMPLETĂ!")
        print("=" * 60)
        print("\n Fișiere generate:")
        print("   - brasov_graph_clean.pkl (pentru Python)")
        print("   - brasov_graph.json (pentru frontend)")
        print(f"\n Statistici finale:")
        print(f"   - Noduri: {len(graph.nodes):,}")
        print(f"   - Muchii: {len(graph.edges):,}")
        print(f"   - Moduri suportate: driving, walking, cycling")
    else:
        print("\n Generarea a eșuat.")