#!/usr/bin/env python3
"""
Тестовый скрипт для проверки разных промптов классификации одежды
Отправляет одно или несколько изображений с разными промптами на FastVLM сервер
"""

import requests
import base64
import json
import time
import os
from pathlib import Path
from typing import List, Dict, Any

# ============================================================================
# КОНФИГУРАЦИЯ
# ============================================================================

# URL FastVLM сервера
FASTVLM_URL = "http://127.0.0.1:3001"

IMAGE_PATH = "server/uploads/wardrobe/568613134/item_568613134_wst2meh8.png" #кроссовки

# Список промптов для тестирования
PROMPTS = [
    
    # Промпт 1: Конкретный тип одежды (максимально полный список)
    """What category of clothing? Answer with ONE WORD ONLY from this list:
OUTERWEAR(), INNERWEAR, BODYWEAR, FULLBODY, LEGWEAR, FOOTWEAR, HEADWEAR, ACCESSORIES""",
    
    # Промпт 2: Конкретный тип одежды (максимально полный список 250+ вариантов)
    """What type of clothing? Answer with ONE WORD ONLY from this list:
jacket, coat, blazer, parka, trench, trenchcoat, bomber, bomberjacket, windbreaker, raincoat, puffer, pufferjacket, downcoat, downjacket, vest, puffervest, fleecevest, denimjacket, leatherjacket, suedejacket, peacoat, dufflecoat, anorak, cagoule, mackintosh, overcoat, topcoat, cardigan, opencardigan, longcardigan, cropcardigan, sweater, pullover, jumper, hoodie, hoodiepullover, ziphoodie, sweatshirt, crewneck, vneck, turtleneck, rollneck, mockneck, fleece, fleecejacket, polartec, poncho, shawl, cape, capelet, wrap, stole, bolero, shrug, shirt, blouse, top, tshirt, tee, tanktop, tank, camisole, cami, tunic, longline, crop, croptop, halter, haltertop, bandeau, bralette, corset, bustier, bodysuit, leotard, polo, poloshirt, henley, buttondown, buttonup, oxfordshirt, flannelshirt, chambray, denimshirt, silkblouse, peasantblouse, peplum, offshoulder, coldshoulder, sleeveless, longsleeve, shortsleeve, threequarter, raglan, batwing, bellsleeve, puffsleeve, dress, gown, eveninggown, ballgown, cocktaildress, partydress, sundress, shirtdress, wrapdress, sheathdress, fitandflare, aline, empire, shift, slip, slipdress, cami, camidress, maxi, maxidress, midi, mididress, mini, minidress, tea, teadress, asymmetric, highlow, mermaid, trumpet, bodycon, skater, tunic, tunicdress, smock, smockdress, pinafore, jumper, jumperdress, jumpsuit, playsuit, romper, shortalls, overalls, dungarees, coveralls, boilersuit, catsuit, unitard, pants, trousers, jeans, denim, skinnyjeans, slimjeans, straightjeans, bootcut, flare, wideleg, boyfriend, momjeans, highrisedjeans, lowrise, midrise, distressed, ripped, chinos, khakis, slacks, dresspants, trousers, cargopants, cargo, utilitytrousers, joggers, trackpants, sweatpants, loungepants, pajamapants, leggings, tights, jeggings, treggings, stirruppants, capris, cropped, croppedpants, anklepants, culottes, gauchos, palazzopants, harem, haremtrousers, shorts, denimshorts, cargoshorts, bermudashorts, chino, chinoshorts, athletic, athleticshorts, running, runningshorts, basketball, basketballshorts, cycling, cyclingshorts, board, boardshorts, swim, swimshorts, hotpants, skirt, miniskirt, midiskirt, maxiskirt, pencilskirt, alineskirt, pleatedskirt, wrapskirt, denimskirt, tuleskirt, circskirt, asymmetricskirt, tieredskirt, ruffledskirt, shoes, boots, sneakers, trainers, runners, kicks, hightops, lowtops, slipons, sandals, slides, flipflops, thongs, heels, highheels, pumps, stilettos, kitten, kittenheel, wedges, platforms, platformheels, flats, balletflats, loafers, pennyloafers, moccasins, drivingshoes, oxfords, brogues, derbys, monks, monkstraps, chelsea, chelseaboots, ankle, ankleboots, booties, knee, kneehighboots, thigh, thighhighboots, overtheknee, combat, combatboots, military, militaryboots, hiking, hikingboots, workboots, cowboy, cowboyboots, western, westernboots, riding, ridingboots, rain, rainboots, wellingtons, wellies, uggs, snowboots, winterboots, espadrilles, slippers, mules, clogs, crocs, boat, boatshoes, topsiders, canvas, canvasshoes, converse, vans, hat, cap, baseballcap, snapback, fitted, trucker, truckercap, dad, dadhat, beanie, knit, knithat, skullcap, watchcap, beret, fedora, trilby, panama, panamaha, bucket, buckethat, sunhat, widebrim, floppy, floppyhat, visor, headband, hairband, scrunchie, scarf, neckscarf, infinity, infinityscarf, bandana, kerchief, neckerchief, turban, headwrap, hijab, shemagh, snood, cowl, balaclava, bag, purse, handbag, shoulderbag, backpack, rucksack, daypack, tote, totebag, shopper, clutch, clutchbag, minaudiere, satchel, messenger, messengerbag, crossbody, crossbodybag, hobo, hobobag, bucket, bucketbag, drawstring, drawstringbag, duffel, duffelbag, weekender, weekenderbag, travelag, gym, gymbag, fanny, fannypack, beltbag, wristlet, pouch, wallet, billfold, cardholder, coinpurse, belt, leatherbelt, canvas, canvasbelt, chain, chainbelt, studded, studdedbelt, woven, wovenbelt, tie, necktie, bowtie, ascot, cravat, bolo, bolotie, suspenders, braces, gloves, mittens, fingerless, fingerlessgloves, socks, anklesocks, crew, crewsocks, knee, kneehighsocks, thigh, thighhighsocks, stockings, tights, pantyhose, fishnets, legwarmers, jewelry, necklace, pendant, choker, collar, chain, locket, pearls, beads, bracelet, bangle, cuff, charm, charmbracelet, anklet, ring, band, signet, cocktailring, stackable, earrings, studs, hoops, dangles, drops, chandelier, watch, wristwatch, smartwatch, chronograph, diver, diverwatch, sunglasses, shades, aviators, wayfarers, cateye, round, oversized, glasses, eyeglasses, spectacles, readers, readingglasses""",
    
    # Промпт 3: Цвет (расширенный список с оттенками)
    """What color of clothing? Answer with ONE WORD ONLY from this list:
black, white, gray, silver, charcoal, blue, navy, lightblue, skyblue, turquoise, cyan, teal, aqua, red, burgundy, maroon, crimson, pink, hotpink, rose, coral, salmon, green, darkgreen, olive, lime, mint, emerald, yellow, gold, mustard, lemon, orange, tangerine, peach, brown, tan, beige, khaki, camel, chocolate, purple, violet, lavender, lilac, magenta, indigo, cream, ivory, offwhite, multicolor""",
    
    # Промпт 4: Стиль (синхронизировано с UI - 10 вариантов)
    """What style of clothing? Answer with ONE WORD ONLY from this list:
casual, business, sporty, streetwear, formal, businesscasual, bohemian, vintage, minimalist, romantic""",
    
    # Промпт 5: Материал
    """What material of clothing? Answer with ONE WORD ONLY from this list:
cotton, polyester, wool, leather, denim, silk, linen, nylon, spandex, fleece, cashmere, suede, canvas, velvet, satin, chiffon, jersey, tweed, corduroy, knit, mesh, synthetic, rubber, plastic, metal, fabric""",
    
    # Промпт 6: Сезон
    """What season of clothing? Answer with ONE WORD ONLY from this list:
winter, spring, summer, autumn, allseason""",
]

# ============================================================================
# ФУНКЦИИ
# ============================================================================

def load_image_as_base64(image_path: str) -> str:
    """Загружает изображение и конвертирует в base64"""
    with open(image_path, 'rb') as f:
        image_data = f.read()
    return base64.b64encode(image_data).decode('utf-8')


def test_prompt(image_base64: str, prompt: str, prompt_index: int) -> Dict[str, Any]:
    """Тестирует один промпт"""
    start_time = time.time()
    
    try:
        # Отправляем запрос на FastVLM сервер
        response = requests.post(
            f"{FASTVLM_URL}/analyze",
            json={
                "image_base64": image_base64,
                "prompt": prompt,
                "nickname": "test_user"
            },
            timeout=120
        )
        
        request_time = time.time() - start_time
        
        if response.status_code == 200:
            result = response.json()
            answer = result.get('technical_analysis', 'Нет ответа')
            
            # Минималистичный вывод: номер, ответ, время
            print(f"\n{prompt_index + 1}. {answer} == {request_time:.2f}с")
            
            return {
                'success': True,
                'prompt_index': prompt_index + 1,
                'prompt': prompt,
                'response': answer,
                'time': request_time,
                'timing_details': result.get('timing', {})
            }
        else:
            print(f"\n{prompt_index + 1}. ❌ ОШИБКА: {response.status_code} == {request_time:.2f}с")
            
            return {
                'success': False,
                'prompt_index': prompt_index + 1,
                'prompt': prompt,
                'error': f"HTTP {response.status_code}: {response.text}",
                'time': request_time
            }
    
    except Exception as e:
        request_time = time.time() - start_time
        print(f"\n{prompt_index + 1}. ❌ ИСКЛЮЧЕНИЕ: {e} == {request_time:.2f}с")
        
        return {
            'success': False,
            'prompt_index': prompt_index + 1,
            'prompt': prompt,
            'error': str(e),
            'time': request_time
        }


def get_image_files(path: str) -> List[str]:
    """Получает список файлов изображений"""
    path_obj = Path(path)
    
    if path_obj.is_file():
        return [str(path_obj)]
    elif path_obj.is_dir():
        image_extensions = {'.jpg', '.jpeg', '.png', '.webp', '.bmp'}
        return [
            str(f) for f in path_obj.iterdir() 
            if f.suffix.lower() in image_extensions
        ]
    else:
        raise ValueError(f"Путь не существует: {path}")

def print_summary(all_results: List[Dict[str, Any]]):
    """Выводит итоговую статистику"""
    total_time = sum(r['time'] for r in all_results)
    print(f"\nОбщее время: {total_time:.2f}с")


# ============================================================================
# ГЛАВНАЯ ФУНКЦИЯ
# ============================================================================

def main():
    """Главная функция"""
    # Получаем список изображений
    try:
        image_files = get_image_files(IMAGE_PATH)
    except Exception as e:
        print(f"❌ Ошибка: {e}")
        return
    
    if not image_files:
        print("❌ Не найдено изображений")
        return
    
    # Проверяем доступность сервера
    try:
        requests.get(f"{FASTVLM_URL}/health", timeout=5)
    except Exception as e:
        print(f"❌ FastVLM сервер недоступен: {e}")
        return
    
    # Тестируем каждое изображение с каждым промптом
    all_results = []
    
    for image_index, image_file in enumerate(image_files):
        # Загружаем изображение
        try:
            image_base64 = load_image_as_base64(image_file)
        except Exception as e:
            print(f"❌ Ошибка загрузки: {e}")
            continue
        
        # Тестируем все промпты
        image_results = []
        for prompt_index, prompt in enumerate(PROMPTS):
            result = test_prompt(image_base64, prompt, prompt_index)
            result['image_file'] = image_file
            result['image_index'] = image_index + 1
            image_results.append(result)
            all_results.append(result)
            
            # Небольшая пауза между запросами
            time.sleep(0.5)
        
    # Выводим итоговую статистику
    print_summary(all_results)
    


if __name__ == "__main__":
    main()
