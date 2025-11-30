use regex::Regex;

fn main() {
    let test_content = r#"<seed:think> 
 用户现在需要我分析这些文件名，找出共同的动画标题。首先看所有文件，每个文件名里都有"Kono Healer, Mendokusai"这个部分，对吧？然后前面是压制组[VCB-Studio]，后面是集数和格式信息。根据规则，要忽略集数、分辨率、编码格式、压制组这些，所以剩下的共同关键词就是"Kono Healer, Mendokusai"。 
  
 接下来确认是不是动画标题，这个看起来是英文或者日文混合的？其实"Kono Healer, Mendokusai"是日语的罗马音加上可能的英文拼写？比如"このヒーラー、めんどくさい"翻译成中文是《这个治愈者，真麻烦》之类的，但原文件名里用的就是"Kono Healer, Mendokusai"，根据规则优先简体中文，但这里所有文件都没有简体中文标题，只有这个英文混合的，所以应该就是这个。 
  
 然后置信度，所有10个文件都包含这个关键词，没有例外，而且没有其他共同的更长的标题，所以置信度应该是1.0吗？因为完全匹配，每个文件都有这个核心部分，忽略掉的都是规则里说的要忽略的内容，所以置信度很高。</seed:think>{"anime_title": "Kono Healer, Mendokusai", "confidence": 1.0}"#;

    println!("原始内容:");
    println!("{}", test_content);
    println!("\n{}", "=".repeat(50));

    // 测试正则表达式
    let re = Regex::new(r"<seed:think>.*?</seed:think>").unwrap();
    let cleaned_content = re.replace_all(test_content, "").to_string();
    
    println!("清理后内容:");
    println!("{}", cleaned_content);
    println!("\n{}", "=".repeat(50));
    
    // 检查是否能解析JSON
    match serde_json::from_str::<serde_json::Value>(&cleaned_content) {
        Ok(json) => {
            println!("JSON解析成功:");
            println!("{}", serde_json::to_string_pretty(&json).unwrap());
        }
        Err(e) => {
            println!("JSON解析失败: {}", e);
        }
    }
}