use regex::Regex;

#[test]
fn test_regex() {
    let test_content = r#"
    <seed:think>
用户现在需要我分析这些文件名，找出共同的动画标题。首先看所有文件名，每个文件开头都是“[VCB-Studio] Kono Healer, Mendokusai [集数]...”，对吧？那根据规则，要忽略压制组（VCB-Studio）、集数（01到10）、分辨率（1080p）、编码格式（x265_flac）这些信息，提取共同的关键词。

首先，“Kono Healer, Mendokusai”这个是每个文件里都有的，而且是在压制组和集数之间的部分，应该就是动画标题了。然后看规则，优先简体中文，但这里没有中文，所以看日文或英文，“Kono Healer, Mendokusai”看起来是日文罗马音或者混有英文的标题，比如“Kono”是“这个”的意思，“Healer”是治疗师，“Mendokusai”是麻烦的，可能就是动画的原名。

然后置信度方面，所有10个文件都包含“Kono Healer, Mendokusai”这个字符串，没有例外，所以匹配程度非常高，应该是1.0吗？还是说 有没有可能有其他情况？比如有没有可能标题有简称，但这里所有文件都完全一致，所以置信度应该是最高的，1.0？不过通常可能不会到1.0？但根据规则，基于文件名相似度和关键词匹配程度，所有文件都完全匹配这个关键词，所以置信度应该是1.0？

等等，再确认一下，每个文件名的结构：[压制组] 标题 [集数][其他信息]，所以标题就是“Kono Healer, Mendokusai”。没有简体中文标题，所以用这个英文/日文混合的标题。那结果就是动画标题是“Kono Healer, Mendokusai”，置信度1.0？</seed:think>{"anime_title": "Kono Healer, Mendokusai", "confidence": 1.0}"#;

    println!("原始内容:");
    println!("{}", test_content);
    println!("\n{}", "=".repeat(50));

    // 测试正则表达式 - 使用单行模式
    let re = Regex::new(r"(?s)<seed:think>.*?</seed:think>").unwrap();
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
